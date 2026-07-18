<?php
$pageTitle = "Linux Install | PokéRogue Offline";
$activeNav = 'install';
include __DIR__ . '/partials/head.php';
?>

  <div class="page-header">
    <p class="page-eyebrow">Getting Started</p>
    <h1 class="page-title">Install on <span>Linux</span></h1>
    <p class="page-subtitle">A fully self-contained AppImage — download, mark executable, run.</p>
    <a href="/install.php" class="back-link">← Back to Install Options</a>
  </div>

  <div class="divider"><span class="divider-icon">✦</span></div>

  <section>
    <div class="install-grid">
      <div class="install-card linux-card">
        <div class="card-header">
          <div>
            <p class="card-num linux">Linux</p>
            <h3 class="card-title">Run the AppImage</h3>
          </div>
          <span class="badge badge-linux">Portable</span>
        </div>
        <p style="margin-bottom:1.25rem; color: var(--text-dim); font-size:0.97rem;">
          No installation needed — the AppImage is fully self-contained. Just download, mark as executable, and run.
        </p>
        <div class="steps">
          <div class="step-row"><span class="step-n">1</span><span>Go to the <a href="https://github.com/PokeRogue-Offline/pokerogue-offline/releases/latest" target="_blank">latest release</a> and download <code>PokeRogueOffline.AppImage</code></span></div>
          <div class="step-row"><span class="step-n">2</span><span>Open a terminal in the download directory and run: <code>chmod +x PokeRogueOffline.AppImage</code></span></div>
          <div class="step-row"><span class="step-n">3</span><span>Run it: <code>./PokeRogueOffline.AppImage</code></span></div>
        </div>

        <div class="steps-sub">
          <p class="steps-sub-title">⚠️ Sandbox Error Fix</p>
          <p style="color:var(--text-dim); font-size:0.93rem; margin-bottom:1rem;">
            If you see a fatal sandbox error mentioning <code>chrome-sandbox</code> not being owned by root or missing mode <code>4755</code>, your system's AppArmor or kernel settings are blocking the Chromium sandbox. There are two ways to fix this:
          </p>
          <p style="color:var(--text); font-size:0.93rem; margin-bottom:0.5rem;"><strong>Option A — Pass <code>--no-sandbox</code> (quickest)</strong></p>
          <p style="color:var(--text-dim); font-size:0.93rem; margin-bottom:1rem;">
            Run the AppImage with the sandbox disabled:
          </p>
          <code style="display:block; padding:0.75rem 1rem; margin-bottom:1.25rem; font-size:0.85rem; line-height:1.6; white-space:pre-wrap;">./PokeRogueOffline.AppImage --no-sandbox</code>
          <p style="color:var(--text); font-size:0.93rem; margin-bottom:0.5rem;"><strong>Option B — AppArmor unprivileged user namespace (recommended)</strong></p>
          <p style="color:var(--text-dim); font-size:0.93rem; margin-bottom:1rem;">
            On Ubuntu 23.10+ and other distros that restrict unprivileged user namespaces, you can create an AppArmor profile that allows the AppImage to sandbox itself properly without disabling security globally:
          </p>
          <code style="display:block; padding:0.75rem 1rem; margin-bottom:0.75rem; font-size:0.85rem; line-height:1.6; white-space:pre-wrap;">sudo aa-status | grep apparmor</code>
          <p style="color:var(--text-dim); font-size:0.93rem; margin-bottom:0.75rem;">If AppArmor is running, create a profile to allow user namespaces for the AppImage:</p>
          <code style="display:block; padding:0.75rem 1rem; margin-bottom:0.75rem; font-size:0.85rem; line-height:1.6; white-space:pre-wrap;">sudo tee /etc/apparmor.d/pokerogue-offline &lt;&lt;'EOF'
abi &lt;abi/4.0&gt;,
include &lt;tunables/global&gt;

profile pokerogue-offline /path/to/PokeRogueOffline.AppImage flags=(unconfined) {
  userns,
}
EOF
sudo apparmor_parser -r /etc/apparmor.d/pokerogue-offline</code>
          <p style="color:var(--text-dim); font-size:0.88rem; font-style:italic;">Replace <code>/path/to/PokeRogueOffline.AppImage</code> with the actual path on your system. After running, launch the AppImage normally without <code>--no-sandbox</code>.</p>
        </div>

        <div class="card-note linux-note">
          The AppImage bundles everything it needs. No dependency installation required.
        </div>
      </div>
    </div>
  </section>

<?php include __DIR__ . '/partials/footer.php'; ?>
