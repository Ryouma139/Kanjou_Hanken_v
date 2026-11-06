/** ログイン・登録画面。Django版の templates/registration/*.html に相当。 */
import type { FC } from "hono/jsx";
import { PASSWORD_HELP, USERNAME_HELP, type FormState } from "../forms.ts";
import { Errs, Layout, type PageCtx } from "./layout.tsx";

export const LoginPage: FC<{ ctx: PageCtx; username: string; next: string; failed: boolean }> = ({ ctx, username, next, failed }) => (
  <Layout ctx={ctx} title="ログイン">
    <form method="post" class="panel auth" novalidate>
      <div class="panel-head"><h2>ログイン</h2><span class="eyebrow">Sign in</span></div>
      {failed && <p class="status err">ニックネームかパスワードが違います。もう一度入力してください。</p>}
      <label class="field" for="id_username">
        ニックネーム
        <input type="text" name="username" id="id_username" value={username} autocomplete="username" autocapitalize="none" maxlength={150} autofocus />
      </label>
      <label class="field" for="id_password">
        パスワード
        <input type="password" name="password" id="id_password" autocomplete="current-password" />
      </label>
      <input type="hidden" name="next" value={next} />
      <div class="actions">
        <button class="btn" type="submit">ログイン</button>
        <a class="btn link" href="/accounts/signup/">はじめての方はこちら</a>
      </div>
    </form>
  </Layout>
);

export const SignupPage: FC<{ ctx: PageCtx; form: FormState }> = ({ ctx, form }) => (
  <Layout ctx={ctx} title="はじめる">
    <form method="post" class="panel auth" novalidate>
      <div class="panel-head"><h2>はじめる</h2><span class="eyebrow">Sign up</span></div>
      <p class="small muted">ニックネームは「名前つきで共有」した半券に表示されます。本名でなくて大丈夫です。</p>

      <label class="field" for="id_username">
        ニックネーム（ログインID）
        <input type="text" name="username" id="id_username" value={form.values.username ?? ""} maxlength={150} autocapitalize="none" autocomplete="username" autofocus />
      </label>
      <Errs list={form.errors.username} />
      <div class="help small muted">{USERNAME_HELP}</div>

      <label class="field" for="id_password1">
        パスワード
        <input type="password" name="password1" id="id_password1" autocomplete="new-password" />
      </label>
      <Errs list={form.errors.password1} />
      <div class="help small muted"><ul>{PASSWORD_HELP.map((h) => <li>{h}</li>)}</ul></div>

      <label class="field" for="id_password2">
        パスワード（確認用）
        <input type="password" name="password2" id="id_password2" autocomplete="new-password" />
      </label>
      <Errs list={form.errors.password2} />
      <div class="help small muted">確認のため、再度パスワードを入力してください。</div>

      <div class="actions">
        <button class="btn" type="submit">登録してはじめる</button>
        <a class="btn link" href="/accounts/login/">ログインはこちら</a>
      </div>
    </form>
  </Layout>
);
