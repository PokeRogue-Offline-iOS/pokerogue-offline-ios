<?php
$pageTitle = "Android Install | PokéRogue Offline";
$activeNav = 'install';
include __DIR__ . '/partials/head.php';
?>

  <div class="page-header">
    <p class="page-eyebrow">Getting Started</p>
    <h1 class="page-title">Install on <span>Android</span></h1>
    <p class="page-subtitle">No sideloading tool needed — just download and install the APK directly.</p>
    <a href="/install.php" class="back-link">← Back to Install Options</a>
  </div>

  <div class="divider"><span class="divider-icon">✦</span></div>

  <section>
    <div class="install-grid">
      <div class="install-card android-card">
        <div class="card-header">
          <div>
            <p class="card-num android">Android</p>
            <h3 class="card-title">Install the APK</h3>
          </div>
          <span class="badge badge-android">Direct Install</span>
        </div>
        <p style="margin-bottom:1.25rem; color: var(--text-dim); font-size:0.97rem;">
          No sideloading tool needed on Android — just download and install the APK directly from the releases page.
        </p>
        <div class="steps">
        <div class="step-row"><span class="step-n">1</span><span>Go to the <a href="https://github.com/PokeRogue-Offline/pokerogue-offline/releases/latest" target="_blank">latest release</a> and download <code>PokeRogueOffline.apk</code></span></div>
        <div class="step-row"><span class="step-n">2</span><span>Open the APK file on your device</span></div>
        <div class="step-row"><span class="step-n">3</span><span>When prompted, go to Settings and enable <strong>Install from Unknown Sources</strong> (or <strong>Install Unknown Apps</strong>) for your browser or Files app</span></div>
        <div class="step-row"><span class="step-n">4</span><span>Return to the APK and tap <strong>Install</strong></span></div>
        <div class="step-row"><span class="step-n">5</span><span>Open PokéRogue Offline and start playing</span></div>
        </div>
        <div class="card-note android-note">
          The APK is debug-signed. Your device may show a warning during install — this is expected and safe to proceed through.
        </div>
      </div>
    </div>
  </section>

<?php include __DIR__ . '/partials/footer.php'; ?>
