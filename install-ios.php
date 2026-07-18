<?php
$pageTitle = "iOS Install | PokéRogue Offline";
$activeNav = 'install';
include __DIR__ . '/partials/head.php';
?>

  <div class="page-header">
    <p class="page-eyebrow">Getting Started</p>
    <h1 class="page-title">Install on <span>iOS</span></h1>
    <p class="page-subtitle">Three ways to sideload PokéRogue Offline, from unlimited apps to a quick one-off signing.</p>
    <a href="/install.php" class="back-link">← Back to Install Options</a>
  </div>

  <div class="divider"><span class="divider-icon">✦</span></div>

  <section>
    <div class="install-grid">

      <!-- LiveContainer — STRONGLY RECOMMENDED -->
      <div class="install-card recommended">
        <div class="card-header">
          <div>
            <p class="card-num">Option 01</p>
            <h3 class="card-title">LiveContainer + SideStore</h3>
          </div>
          <span class="badge badge-recommended">⭐ Strongly Recommended</span>
        </div>

        <div class="strongly-recommended-banner">
          <span class="sr-icon">✦</span>
          <span>
            <strong>This is the best way to run PokéRogue Offline on iOS.</strong>
            LiveContainer lets you run unlimited IPAs inside a container — no slot limits, no manual signing, and no 7-day refresh. If you're starting from scratch, start here.
          </span>
        </div>

        <div class="warn-box">
          <span class="warn-box-icon">⚠️</span>
          <span><strong>iOS 26.4 users:</strong> SideStore's stable release has a known bug on iOS 26.4. When setting up, choose the <strong>Nightly</strong> build instead. You can also get it manually from the <a href="https://nightly.sidestore.io/" target="_blank">SideStore Nightly page</a>.</span>
        </div>

        <p style="color: var(--text-dim); font-size:0.97rem; margin-bottom:1.5rem;">
          Requires a one-time computer setup with iLoader, then everything runs wirelessly from the device. Full instructions on the dedicated guide page.
        </p>
        <a href="/ios-sidestore-livecontainer.php" class="guide-link">→ Full Setup Guide</a>
      </div>

      <!-- SideStore only -->
      <div class="install-card">
        <div class="card-header">
          <div>
            <p class="card-num">Option 02</p>
            <h3 class="card-title">SideStore</h3>
          </div>
          <span class="badge badge-simple">Up to 3 apps</span>
        </div>
        <p style="margin-bottom:1.25rem; color: var(--text-dim); font-size:0.97rem;">
          Wireless refresh, no PC needed after setup. Limited to 3 sideloaded apps at once, and apps must be refreshed every 7 days.
        </p>
        <div class="warn-box">
          <span class="warn-box-icon">⚠️</span>
          <span><strong>iOS 26.4 users:</strong> The stable release of SideStore has a known bug on iOS 26.4. You must install the <strong>Nightly</strong> build instead. Get it from the <a href="https://nightly.sidestore.io/" target="_blank">SideStore Nightly page</a>.</span>
        </div>
        <div class="steps">
        <div class="step-row"><span class="step-n">1</span><span>Go to <a href="https://iloader.app/" target="_blank">iloader.app</a>, download iLoader, and use it to install SideStore (Nightly if on iOS 26.4) on your iPhone</span></div>
        <div class="step-row"><span class="step-n">2</span><span>Open SideStore and tap <strong>+</strong> in My Apps</span></div>
        <div class="step-row"><span class="step-n">3</span><span>Select <code>PokeRogueOffline.ipa</code></span></div>
        <div class="step-row"><span class="step-n">4</span><span>Refresh every 7 days — automate this with a Shortcuts automation if desired</span></div>
        </div>
      </div>

      <!-- Feather / Sideloadly -->
      <div class="install-card">
        <div class="card-header">
          <div>
            <p class="card-num">Option 03</p>
            <h3 class="card-title">Feather / Sideloadly</h3>
          </div>
          <span class="badge badge-simple">Already a user?</span>
        </div>
        <p style="color: var(--text-dim); font-size:0.97rem;">
          If you already use Feather or Sideloadly, just sign and install the IPA as you normally would. No special steps needed.
        </p>
      </div>

    </div>
  </section>

<?php include __DIR__ . '/partials/footer.php'; ?>
