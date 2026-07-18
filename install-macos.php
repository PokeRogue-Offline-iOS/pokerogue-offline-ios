<?php
$pageTitle = "macOS Install | PokéRogue Offline";
$activeNav = 'install';
include __DIR__ . '/partials/head.php';
?>

  <div class="page-header">
    <p class="page-eyebrow">Getting Started</p>
    <h1 class="page-title">Install on <span>macOS</span></h1>
    <p class="page-subtitle">Apple Silicon (arm64) and Intel (x64) builds are both available.</p>
    <a href="/install.php" class="back-link">← Back to Install Options</a>
  </div>

  <div class="divider"><span class="divider-icon">✦</span></div>

  <section>
    <div class="install-grid">
      <div class="install-card macos-card">
        <div class="card-header">
          <div>
            <p class="card-num macos">macOS</p>
            <h3 class="card-title">Apple Silicon (arm64)</h3>
          </div>
          <span class="badge badge-macos">M1/M2/M3/M4</span>
        </div>
        <p style="margin-bottom:1.25rem; color: var(--text-dim); font-size:0.97rem;">
          For Macs with Apple Silicon chips.
        </p>
        <div class="steps">
          <div class="step-row"><span class="step-n">1</span><span>Go to the <a href="https://github.com/PokeRogue-Offline/pokerogue-offline/releases/latest" target="_blank">latest release</a> and download <code>PokeRogueOffline-arm64.dmg</code></span></div>
          <div class="step-row"><span class="step-n">2</span><span>Open the DMG and drag the app into <strong>Applications</strong></span></div>
          <div class="step-row"><span class="step-n">3</span><span>On first launch, right-click (or Control-click) the app and choose <strong>Open</strong> to bypass Gatekeeper</span></div>
        </div>
        <div class="card-note macos-note">
          The app is unsigned and not notarized. If macOS still refuses to open it after right-click → Open, run <code>xattr -cr /Applications/PokeRogueOffline.app</code> in Terminal, then try again.
        </div>
      </div>

      <div class="install-card macos-card">
        <div class="card-header">
          <div>
            <p class="card-num macos">macOS</p>
            <h3 class="card-title">Intel (x64)</h3>
          </div>
          <span class="badge badge-macos">Intel Macs</span>
        </div>
        <p style="margin-bottom:1.25rem; color: var(--text-dim); font-size:0.97rem;">
          For Macs with Intel chips.
        </p>
        <div class="steps">
          <div class="step-row"><span class="step-n">1</span><span>Go to the <a href="https://github.com/PokeRogue-Offline/pokerogue-offline/releases/latest" target="_blank">latest release</a> and download <code>PokeRogueOffline-x64.dmg</code></span></div>
          <div class="step-row"><span class="step-n">2</span><span>Open the DMG and drag the app into <strong>Applications</strong></span></div>
          <div class="step-row"><span class="step-n">3</span><span>On first launch, right-click (or Control-click) the app and choose <strong>Open</strong> to bypass Gatekeeper</span></div>
        </div>
        <div class="card-note macos-note">
          The app is unsigned and not notarized. If macOS still refuses to open it after right-click → Open, run <code>xattr -cr /Applications/PokeRogueOffline.app</code> in Terminal, then try again.
        </div>
      </div>
    </div>
  </section>

<?php include __DIR__ . '/partials/footer.php'; ?>
