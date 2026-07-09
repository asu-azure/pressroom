<script lang="ts">
  import { supabase } from '../../lib/supabase';

  let email = $state('');
  let password = $state('');
  let busy = $state(false);
  let error = $state<string | null>(null);

  async function signIn(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = null;
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    busy = false;
    if (err) {
      error = err.message;
      return;
    }
    location.href = '/studio';
  }
</script>

<form class="login" onsubmit={signIn}>
  <p class="mono login__kicker">PRESSROOM · STUDIO ACCESS</p>
  <h1 class="serif login__title">Sign in</h1>

  <label class="login__field">
    <span class="mono">EMAIL</span>
    <input type="email" bind:value={email} autocomplete="username" required />
  </label>
  <label class="login__field">
    <span class="mono">PASSWORD</span>
    <input type="password" bind:value={password} autocomplete="current-password" required />
  </label>

  {#if error}
    <p class="mono login__error">{error}</p>
  {/if}

  <button class="login__btn mono" type="submit" disabled={busy} data-magnetic>
    {busy ? 'CHECKING…' : 'ENTER THE PRESSROOM →'}
  </button>
</form>

<style>
  .login {
    width: min(24rem, 100%);
    display: grid;
    gap: 1.3rem;
    padding: clamp(1.6rem, 4vw, 2.4rem);
    border: 1px solid var(--line-strong);
    background: var(--bg-soft);
  }
  .login__title {
    font-size: 2rem;
  }
  .login__field {
    display: grid;
    gap: 0.45rem;
  }
  .login__field input {
    background: var(--bg);
    border: 1px solid var(--line-strong);
    color: var(--fg);
    font: inherit;
    padding: 0.65em 0.8em;
    transition: border-color 0.25s var(--ease);
  }
  .login__field input:focus {
    outline: none;
    border-color: var(--accent);
  }
  .login__error {
    color: #e8a31a;
  }
  .login__btn {
    justify-self: start;
    background: var(--accent);
    color: var(--ink-fg);
    border: 0;
    padding: 0.85em 1.4em;
    cursor: pointer;
  }
  .login__btn:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
