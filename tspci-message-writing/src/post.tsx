import { Env } from "./context";
import { Post, countChars } from "./message";
import { formatDate } from "./texts";
import { Aids, Avatar, Editor, Rich, btn, primary } from "./writing";

// A forum thread or a social-media post with its replies, and the candidate's reply under it.

const PostView = ({ post, env, mine, id }: { post: Post; env: Env; mine?: boolean; id: string }) => {
  const social = env.scenario.post.platform === "social";
  return (
    <article aria-labelledby={id} className={`flex gap-3 ${social ? "py-3" : "rounded-lg border border-slate-200 bg-white p-3"} ${mine ? "ring-2 ring-sky-300" : ""}`}
      data-testid={mine ? "own-post" : "post"}>
      <Avatar name={post.author} color={mine ? "#0369a1" : "#64748b"} />
      <div className="flex min-w-0 grow flex-col gap-1">
        <header className="flex flex-wrap items-baseline gap-x-2">
          <h4 id={id} className="m-0 text-sm font-semibold text-slate-900">{post.author}</h4>
          {post.handle && <span className="text-[13px] text-slate-500">{post.handle}</span>}
          {post.date && <time dateTime={post.date} className="text-[13px] text-slate-500">{formatDate(post.date, env.ui)}</time>}
        </header>
        <Rich text={post.text} lang={env.lang} />
        {post.image && <img src={post.image} alt={env.t.image} className="mt-1 max-h-64 max-w-full self-start rounded-lg border border-slate-200 object-contain" />}
      </div>
    </article>
  );
};

export const PostBoard = ({ env }: { env: Env }) => {
  const { t, state, scenario, store, readOnly, announce } = env;
  const p = state.post;
  const thread = scenario.post;
  const social = thread.platform === "social";
  const set = (patch: Partial<typeof p>) => store.dispatch({ type: "POST", payload: { ...patch, seconds: env.elapsed() } });
  const over = env.limits.maxChars !== undefined && countChars(p.text) > env.limits.maxChars; // as on a real platform: too long cannot be posted
  const [first, ...replies] = thread.posts;
  const shownReplies = replies.length + (p.posted || (readOnly && p.text) ? 1 : 0);
  return (
    <section aria-labelledby="thread-title" className={`flex flex-col overflow-hidden rounded-xl border border-slate-200 shadow-sm ${social ? "bg-white" : "bg-slate-50"}`} data-testid="board">
      <header className={`flex items-center gap-2 border-b border-slate-200 px-4 py-2.5 ${social ? "bg-white" : "bg-indigo-900 text-white"}`}>
        <span aria-hidden="true">{social ? "💬" : "🗂"}</span>
        <h3 id="thread-title" className="m-0 text-base font-semibold">{thread.title || (social ? t.posts : t.thread)}</h3>
        <span className={`ml-auto text-[13px] ${social ? "text-slate-500" : "text-indigo-100"}`}>{t.replies(shownReplies)}</span>
      </header>
      <ol aria-label={t.posts} className={`m-0 flex list-none flex-col p-3 ${social ? "divide-y divide-slate-200" : "gap-2"}`}>
        {first && <li><PostView post={first} env={env} id="post-0" /></li>}
        {replies.map((r, i) => <li key={i} className={social ? "" : "ml-6"}><PostView post={r} env={env} id={`post-${i + 1}`} /></li>)}
        {(p.posted || (readOnly && p.text)) && (
          <li className={social ? "" : "ml-6"}>
            <PostView post={{ author: scenario.me.name, text: p.text, date: p.posted ?? undefined }} env={env} mine id="post-own" />
            {!readOnly && (
              <div className="mt-2 flex items-center gap-3 pl-12">
                <span className="text-sm font-medium text-emerald-800"><span aria-hidden="true">✓ </span>{t.postedAt(formatDate(p.posted!, env.ui))}</span>
                <button type="button" className={btn} onClick={() => set({ posted: null })}>{t.editPost}</button>
              </div>
            )}
          </li>
        )}
      </ol>
      {!readOnly && !p.posted && (
        <form className="flex flex-col gap-2 border-t border-slate-200 bg-white p-3" aria-label={first ? t.yourReply : t.whatsHappening}
          onSubmit={(e) => {
            e.preventDefault();
            if (!p.text.trim() || over) return;
            set({ posted: env.now() });
            announce(t.posted);
          }}>
          <Editor id="post-text" label={first ? t.yourReply : t.whatsHappening} value={p.text} onChange={(text) => set({ text })} t={t} lang={env.lang}
            spellcheck={env.spellcheck} rows={4} formatting={!social} describedBy="post-count" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Aids text={p.text} limits={env.limits} t={t} id="post-count" showCount={env.showCount} spell={env.spell} />
            <button type="submit" className={primary} disabled={!p.text.trim() || over}>{t.post}</button>
          </div>
        </form>
      )}
    </section>
  );
};
