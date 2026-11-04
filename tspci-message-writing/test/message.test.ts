// npm test: the logic of message writing (src/message.ts) in node, without a build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHOICE_CHAT, EXAMPLE, blocks, chatAnswer, choicesOf, fillName, lastStepOf, sentOf, countChars, countWords, evaluate, format, hasPhrase, messageText, nextStep, parseAddresses, parseScenario, passes,
  plainText, repliesOf, replay, sendChat, serializeScenario, startChat, toHtml, type Answer, type Check, type Limits,
} from "../src/message.ts";

const limits: Limits = { minWords: 5, maxWords: 20 };
const answer = (over: Partial<Answer> = {}): Answer => {
  const text = over.text ?? "Dear Lotte,\n\nWe are coming with 24 students. Can we rent bikes?\n\nKind regards,\nSam";
  return { environment: "email", to: [], cc: [], subject: "", attachments: [], text, replies: [text], ...over };
};
const T = "2026-11-03T10:15:00";

test("words and characters", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countWords("Don't forget the twenty-four bikes!"), 5);
  assert.equal(countWords("**Bold** and *italic*\n- one\n- two"), 5);
  assert.equal(countWords("Één café, très bien"), 4);
  assert.equal(countChars("Hi 😀"), 4);
  assert.equal(countChars("**ab**"), 2);
  assert.equal(plainText("- item *x*"), "item x");
});

test("formatting: buttons, html and blocks", () => {
  assert.deepEqual(format("make bold", 5, 9, "bold"), { text: "make **bold**", start: 7, end: 11 });
  assert.deepEqual(format("make **bold**", 7, 11, "bold"), { text: "make bold", start: 5, end: 9 });
  assert.equal(format("a b", 2, 3, "italic").text, "a *b*");
  assert.equal(format("one\ntwo\nthree", 0, 7, "list").text, "- one\n- two\nthree");
  assert.equal(format("- one\n- two", 0, 11, "list").text, "one\ntwo");
  assert.equal(toHtml("Hi **you** & <b>\n\n- a\n- *b*\nend"), "<p>Hi <strong>you</strong> &amp; &lt;b&gt;</p><ul><li>a</li><li><em>b</em></li></ul><p>end</p>");
  assert.deepEqual(blocks("a\nb\n\n- c"), [
    { type: "p", lines: [[{ text: "a" }], [{ text: "b" }]] },
    { type: "ul", items: [[{ text: "c" }]] },
  ]);
});

test("addresses: separators, names of contacts, Name <address>", () => {
  const contacts = [{ name: "Lotte Bakker", address: "Lotte@greenvalley.example" }];
  assert.deepEqual(parseAddresses("a@x.nl; B@x.nl, a@x.nl", contacts), ["a@x.nl", "b@x.nl"]);
  assert.deepEqual(parseAddresses("Lotte Bakker", contacts), ["lotte@greenvalley.example"]);
  assert.deepEqual(parseAddresses("Lotte <lotte@x.nl>, c@x.nl d@x.nl"), ["lotte@x.nl", "c@x.nl", "d@x.nl"]);
});

test("phrases: case-insensitive, whole words, wildcards, alternatives, other scripts", () => {
  assert.equal(hasPhrase("Can we rent BIKES?", "bike*"), true);
  assert.equal(hasPhrase("Can we rent motorbikes?", "bike*"), false);
  assert.equal(hasPhrase("We are 24.", "24|twenty-four"), true);
  assert.equal(hasPhrase("We are 124.", "24"), false);
  assert.equal(hasPhrase("Met vriendelijke  groet,", "vriendelijke groet"), true);
  assert.equal(hasPhrase("Ich freue mich über Ihre Antwort", "über"), true);
  assert.equal(hasPhrase("brief", "rie"), false);
  assert.equal(hasPhrase("anything", ""), false);
});

test("checks: recipient, subject, attachment", () => {
  const a = answer({ to: ["lotte@greenvalley.example", "x@y.nl"], cc: ["visser@school.example"], subject: "Re: ", attachments: ["dietary-needs.pdf"] });
  assert.equal(passes({ type: "recipient", address: "Lotte@greenvalley.example" }, a, limits), true);
  assert.equal(passes({ type: "recipient", address: "lotte@greenvalley.example", exact: true }, a, limits), false);
  assert.equal(passes({ type: "recipient", address: "visser@school.example" }, a, limits), false);
  assert.equal(passes({ type: "recipient", address: "visser@school.example", field: "cc" }, a, limits), true);
  assert.equal(passes({ type: "recipient", address: "Mr Visser", field: "any" }, a, limits, "en", EXAMPLE.contacts), true);
  // a subject that is only "Re:" is empty
  assert.equal(passes({ type: "subject" }, a, limits), false);
  assert.equal(passes({ type: "subject" }, { ...a, subject: "Re: booking" }, limits), true);
  assert.equal(passes({ type: "subject", phrases: ["trip"] }, { ...a, subject: "booking" }, limits), false);
  assert.equal(passes({ type: "attachment", name: "Dietary-needs.PDF" }, a, limits), true);
  assert.equal(passes({ type: "attachment", name: "class-photo.jpg" }, a, limits), false);
  assert.equal(passes({ type: "attachment", name: "dietary-needs.pdf", exact: true }, { ...a, attachments: ["dietary-needs.pdf", "x"] }, limits), false);
});

test("checks: words and characters within the limits", () => {
  const a = answer(); // 15 words
  assert.equal(countWords(a.text), 15);
  assert.equal(passes({ type: "words" }, a, limits), true);
  assert.equal(passes({ type: "words" }, a, { ...limits, maxWords: 10 }), false);
  assert.equal(passes({ type: "words", min: 16 }, a, limits), false);
  assert.equal(passes({ type: "words" }, answer({ text: "" }), {}), false);
  assert.equal(passes({ type: "chars", max: 20 }, a, limits), false);
  assert.equal(passes({ type: "chars" }, a, { ...limits, maxChars: 280 }), true);
});

test("checks: phrases, greeting and closing per language", () => {
  const a = answer();
  assert.equal(passes({ type: "phrases", phrases: ["24", "bike*"] }, a, limits), true);
  assert.equal(passes({ type: "phrases", phrases: ["24", "tent*"] }, a, limits), false);
  assert.equal(passes({ type: "phrases", phrases: ["24", "tent*"], need: 1 }, a, limits), true);
  assert.equal(passes({ type: "greeting" }, a, limits), true);
  assert.equal(passes({ type: "closing" }, a, limits), true);
  assert.equal(passes({ type: "greeting" }, answer({ text: "Lotte, hi" }), limits), false);
  assert.equal(passes({ type: "greeting" }, answer({ text: "Hidden" }), limits), false);
  const nl = answer({ text: "Beste mevrouw,\n\nIk kom.\n\nMet vriendelijke groet,\nSam" });
  assert.equal(passes({ type: "greeting" }, nl, {}, "nl"), true);
  assert.equal(passes({ type: "closing" }, nl, {}, "nl"), true);
  assert.equal(passes({ type: "closing" }, nl, {}, "en"), false);
  assert.equal(passes({ type: "greeting", phrases: ["Geachte"] }, nl, {}, "nl"), false);
  const de = answer({ text: "Sehr geehrte Frau Weber,\nich komme.\nMit freundlichen Grüßen\nSam" });
  assert.equal(passes({ type: "greeting" }, de, {}, "de") && passes({ type: "closing" }, de, {}, "de"), true);
  const fr = answer({ text: "Bonjour Madame,\nJe viens.\nCordialement,\nSam" });
  assert.equal(passes({ type: "greeting" }, fr, {}, "fr") && passes({ type: "closing" }, fr, {}, "fr"), true);
  // chat: the greeting in the first reply, the closing anywhere in the last
  const chat: Answer = { ...answer(), environment: "chat", replies: ["Hey guys!", "ok", "I'll bring it, see you tomorrow"], text: "" };
  assert.equal(passes({ type: "greeting" }, chat, limits), true);
  assert.equal(passes({ type: "closing" }, chat, limits), true);
  assert.equal(passes({ type: "replies", min: 3 }, chat, limits), true);
  assert.equal(passes({ type: "replies", min: 4 }, chat, limits), false);
});

test("evaluate: score, maxscore, correct; checks of another environment do not pass", () => {
  assert.equal(evaluate([{ type: "attachment", name: "x.pdf" }], answer({ environment: "post", attachments: ["x.pdf"] }), {}).score, 0);
  const checks: Check[] = [{ type: "greeting", points: 2 }, { type: "attachment", name: "x.pdf" }];
  const e = evaluate(checks, answer(), limits);
  assert.deepEqual([e.score, e.maxscore, e.correct, e.results.map((r) => r.passed)], [2, 3, false, [true, false]]);
  assert.equal(evaluate([], answer(), limits).correct, false);
  assert.equal(evaluate(checks, answer({ attachments: ["X.pdf"] }), limits).correct, true);
});

test("the example's model answer passes its own checks", () => {
  const m = EXAMPLE.email.model!;
  const a: Answer = {
    environment: "email", to: parseAddresses(m.to!), cc: parseAddresses(m.cc!), subject: m.subject!, attachments: m.attachments!, text: m.body!, replies: [m.body!],
  };
  const e = evaluate(EXAMPLE.email.checks, a, EXAMPLE.email.limits, "en");
  assert.deepEqual(e.results.filter((r) => !r.passed).map((r) => r.check.type), []);
  assert.equal(e.score, 7);
  // the chat's and the post's model answers too
  const replies = EXAMPLE.chat.model!;
  const chat: Answer = { environment: "chat", to: [], cc: [], subject: "", attachments: [], replies, text: replies.join("\n\n") };
  assert.equal(evaluate(EXAMPLE.chat.checks, chat, {}).correct, true);
  assert.equal(replay(EXAMPLE.chat, replies, T, "Sam").waiting, null);
  const post: Answer = { environment: "post", to: [], cc: [], subject: "", attachments: [], replies: [EXAMPLE.post.model!], text: EXAMPLE.post.model! };
  assert.equal(evaluate(EXAMPLE.post.checks, post, EXAMPLE.post.limits).correct, true);
});

test("the scenario: the example, parts of one, rubbish", () => {
  assert.equal(parseScenario("").email.inbox.length, 2);
  assert.equal(parseScenario("{").email.checks.length, EXAMPLE.email.checks.length);
  const own = parseScenario(JSON.stringify({ email: { inbox: [{ from: { name: "A", address: "a@b.nl" }, subject: "S", body: "B" }], limits: { maxWords: "80", minWords: -1 }, checks: [{ type: "words", min: "10" }, { type: "nope" }] } }));
  assert.equal(own.email.inbox[0].id, "m1");
  assert.equal(own.email.start, "inbox");
  assert.deepEqual(own.email.checks, [{ type: "words", points: 1, min: 10 }]);
  assert.deepEqual(own.email.limits, { maxWords: 80 });
  assert.equal(own.chat, EXAMPLE.chat);
  assert.equal(parseScenario(JSON.stringify({ chat: {} })).chat.checks.length, 0);
  // round trip
  const again = parseScenario(serializeScenario(EXAMPLE));
  assert.deepEqual(again.chat.steps, EXAMPLE.chat.steps);
  assert.deepEqual(again.email.checks, EXAMPLE.email.checks);
  assert.deepEqual(again.post, EXAMPLE.post);
  assert.deepEqual(again.email.model, EXAMPLE.email.model);
});

test("chat: branching on keywords, the default, the end", () => {
  const chat = EXAMPLE.chat;
  assert.equal(nextStep(chat, "start", "I'll bring lemonade")?.id, "drinks");
  assert.equal(nextStep(chat, "start", "I can make a CAKE")?.id, "snacks");
  assert.equal(nextStep(chat, "start", "Yes!")?.id, "unclear");
  let s = startChat(chat, T);
  assert.deepEqual([s.transcript.length, s.waiting, s.ended], [2, "start", false]);
  s = sendChat(chat, s, "Hmm", T, "Sam");
  assert.deepEqual([s.transcript.length, s.waiting], [4, "unclear"]);
  s = sendChat(chat, s, "  ", T, "Sam");
  assert.equal(s.transcript.length, 4);
  s = sendChat(chat, s, "Drinks!", T, "Sam");
  assert.equal(s.waiting, "drinks");
  s = sendChat(chat, s, "Four", T, "Sam");
  assert.equal(s.waiting, "card");
  s = sendChat(chat, s, "Thanks for everything", T, "Sam");
  assert.deepEqual([s.waiting, s.ended], [null, false]);
  // after the script, the candidate may still write; nobody answers
  s = sendChat(chat, s, "Bye!", T, "Sam");
  assert.deepEqual(repliesOf(s.transcript), ["Hmm", "Drinks!", "Four", "Thanks for everything", "Bye!"]);
  assert.equal(s.transcript.length, 10);
  // a step with end: the chat closes
  const ending = { ...chat, steps: [{ id: "a", messages: [{ from: "X", text: "hi" }], branches: [], next: "b" }, { id: "b", messages: [{ from: "X", text: "bye" }], branches: [], end: true }] };
  const done = sendChat(ending, startChat(ending, T), "hello", T, "Sam");
  assert.deepEqual([done.ended, done.waiting], [true, null]);
  assert.equal(sendChat(ending, done, "more", T, "Sam"), done);
  assert.deepEqual(repliesOf(replay(chat, ["juice", "two"], T, "Sam").transcript), ["juice", "two"]);
});

test("the message for a rater", () => {
  const labels = { to: "To", cc: "Cc", subject: "Subject", attachments: "Attachments", me: "You", draft: "not sent", notSent: "not sent" };
  const a = answer({ to: ["a@b.nl"], cc: [], subject: "Hi", attachments: ["x.pdf"], text: "Body" });
  assert.equal(messageText(a, labels, { sent: true }), "To: a@b.nl\nSubject: Hi\nAttachments: x.pdf\n\nBody");
  assert.equal(messageText({ ...a, environment: "post" }, labels, { sent: false }), "(not sent)\n\nBody");
  const chat = messageText({ ...a, environment: "chat" }, labels, {
    transcript: [{ from: "Noor", text: "Hi", time: "2026-11-03T10:15:00" }, { from: "Sam", text: "Hey", time: "2026-11-03T10:16:00", me: true }],
    draft: "half",
  });
  assert.equal(chat, "[10:15] Noor: Hi\n[10:16] You: Hey\n(not sent) half");
});

test("chat: choice steps, the name step, cards and notices", () => {
  const chat = CHOICE_CHAT;
  let s = startChat(chat, T, "Sam Jansen");
  assert.deepEqual([s.waiting, s.at, s.transcript.length, s.transcript[0].kind], ["hello", "hello", 2, "system"]);
  // the name step: the reply is the name; {firstName} in the next messages
  s = sendChat(chat, s, "  Lena   de Vries ", T, "Sam Jansen");
  assert.equal(s.name, "Lena de Vries");
  assert.equal(s.transcript[2].kind, "name");
  assert.equal(s.transcript[3].text, "Nice to meet you, Lena! Here is the training schedule.");
  assert.deepEqual([s.transcript[4].kind, s.transcript[4].title], ["card", "Training schedule"]);
  assert.equal(s.waiting, "schedule");
  // a choice step takes only its options (by id or text); free text does nothing
  assert.equal(sendChat(chat, s, "I will come", T, "Sam"), s);
  s = sendChat(chat, s, "sorry, i can't on tuesday. is thursday ok?", T, "Sam");
  assert.deepEqual([s.transcript[6].kind, s.transcript[6].choice, s.transcript[6].from], ["choice", "thursday", "Lena de Vries"]);
  assert.deepEqual([s.waiting, s.at], ["thursday", "thursday"]);
  assert.equal(s.transcript[8].text, "Do you have a question about the training, Lena?");
  s = sendChat(chat, s, "What should I wear?", T, "Sam");
  assert.deepEqual([s.ended, s.waiting, lastStepOf(s)], [true, null, "bye"]);
  assert.equal(s.transcript[s.transcript.length - 1].kind, "system");
  // only written replies are text; the choices with their step, category and points
  assert.deepEqual(repliesOf(s.transcript), ["What should I wear?"]);
  assert.deepEqual(sentOf(s.transcript), ["Lena de Vries", "thursday", "What should I wear?"]);
  assert.deepEqual(choicesOf(chat, s.transcript), [{ step: "schedule", id: "thursday", category: "polite", points: 2 }]);
  // replaying what was sent gives the same chat (setResponse)
  assert.deepEqual(replay(chat, sentOf(s.transcript), T, "Sam Jansen"), s);
});

test("chat: the choices check, points per option or per category", () => {
  const chat = CHOICE_CHAT;
  const rude = chatAnswer(chat, replay(chat, ["Sam", "whatever", "Why?"], T, "Sam").transcript);
  assert.deepEqual(rude.choices!.map((c) => [c.id, c.category, c.points]), [["whatever", "rude", 0]]);
  assert.equal(evaluate(chat.checks, rude, {}).score, 1); // only the replies check
  const polite = chatAnswer(chat, replay(chat, chat.model!, T, "Sam").transcript);
  assert.deepEqual(evaluate(chat.checks, polite, {}).results.map((r) => r.passed), [true, true, true]);
  // an option's own points win over its category's
  const own = { ...chat, steps: chat.steps.map((st) => (st.options ? { ...st, options: st.options.map((o) => (o.id === "maybe" ? { ...o, points: 5 } : o)) } : st)) };
  assert.equal(choicesOf(own, replay(own, ["Sam", "maybe"], T, "Sam").transcript)[0].points, 5);
  // without choices the check does not pass, whatever its range
  assert.equal(passes({ type: "choices", name: "rude", max: 0 }, answer({ environment: "chat", choices: [] }), {}), false);
  assert.equal(passes({ type: "choices", name: "Polite", min: 1 }, polite, {}), true);
  // the old example: no options, no choices
  assert.deepEqual(chatAnswer(EXAMPLE.chat, replay(EXAMPLE.chat, ["juice"], T, "Sam").transcript).choices, []);
});

test("chat: the name placeholder; the scenario keeps the new step types", () => {
  assert.equal(fillName("Hi {name}! {firstName}, {FirstName}", "Lena de Vries"), "Hi Lena de Vries! Lena, Lena");
  // without a name step, the name of the scenario
  assert.equal(startChat({ ...CHOICE_CHAT, steps: CHOICE_CHAT.steps.slice(3) }, T, "Sam Jansen").transcript[0].text, "Do you have a question about the training, Sam?");
  const again = parseScenario(serializeScenario({ ...EXAMPLE, chat: CHOICE_CHAT }));
  assert.deepEqual(again.chat.steps, CHOICE_CHAT.steps);
  assert.deepEqual(again.chat.categoryPoints, CHOICE_CHAT.categoryPoints);
  assert.deepEqual(again.chat.checks, CHOICE_CHAT.checks);
  // options without an id get one; HTML stays text; unknown kinds are left out
  const own = parseScenario(JSON.stringify({ chat: { steps: [{ messages: [{ from: "A", text: "<b>x</b>", kind: "iframe" }], options: [{ text: "A" }, { text: "" }, { text: "B", points: "2" }] }] } }));
  assert.deepEqual(own.chat.steps[0].messages, [{ from: "A", text: "<b>x</b>" }]);
  assert.deepEqual(own.chat.steps[0].options, [{ id: "o1", text: "A" }, { id: "o3", text: "B", points: 2 }]);
});

test("the message for a rater: notices, cards, choices", () => {
  const labels = { to: "To", cc: "Cc", subject: "Subject", attachments: "Attachments", me: "Lena", draft: "not sent", notSent: "not sent" };
  const s = replay(CHOICE_CHAT, ["Lena", "maybe"], T, "Sam");
  const text = messageText(chatAnswer(CHOICE_CHAT, s.transcript), labels, { transcript: s.transcript });
  assert.match(text, /^\[10:15\] \(Mila added you to the chat\.\)\n/);
  assert.match(text, /\[10:15\] Mila: \[Training schedule\] Tuesday/);
  assert.match(text, /\[10:15\] Lena: Maybe\. \(maybe\)/);
});
