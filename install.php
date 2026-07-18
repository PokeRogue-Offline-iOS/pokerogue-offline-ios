<?php
$pageTitle = "Install | PokéRogue Offline";
$activeNav = 'install';
include __DIR__ . '/partials/head.php';
?>

  <div class="page-header">
    <p class="page-eyebrow">Getting Started</p>
    <h1 class="page-title">Installing the App</h1>
    <p class="page-subtitle">Choose your platform below and follow the steps to get PokéRogue Offline on your device.</p>
    <a href="/index.php" class="back-link">← Back to Home</a>
  </div>

  <div class="divider"><span class="divider-icon">✦</span></div>

  <section>
    <div class="platform-grid">
      <a href="/install-ios.php" class="platform-card">
        <span class="platform-card-icon">🍎</span>
        <p class="platform-card-title">iOS</p>
        <p class="platform-card-desc">LiveContainer + SideStore (recommended), SideStore alone, or Feather/Sideloadly.</p>
        <p class="platform-card-arrow">→ View instructions</p>
      </a>
      <a href="/install-android.php" class="platform-card android-card">
        <span class="platform-card-icon">🤖</span>
        <p class="platform-card-title">Android</p>
        <p class="platform-card-desc">Direct APK install — no sideloading tool needed.</p>
        <p class="platform-card-arrow">→ View instructions</p>
      </a>
      <a href="/install-linux.php" class="platform-card linux-card">
        <span class="platform-card-icon">🐧</span>
        <p class="platform-card-title">Linux</p>
        <p class="platform-card-desc">Portable AppImage, plus a sandbox error fix if you need it.</p>
        <p class="platform-card-arrow">→ View instructions</p>
      </a>
      <a href="/install-windows.php" class="platform-card windows-card">
        <span class="platform-card-icon">🪟</span>
        <p class="platform-card-title">Windows</p>
        <p class="platform-card-desc">Portable EXE, no installation required.</p>
        <p class="platform-card-arrow">→ View instructions</p>
      </a>
      <a href="/install-macos.php" class="platform-card macos-card">
        <span class="platform-card-icon">🖥️</span>
        <p class="platform-card-title">macOS</p>
        <p class="platform-card-desc">Apple Silicon (arm64) and Intel (x64) builds.</p>
        <p class="platform-card-arrow">→ View instructions</p>
      </a>
    </div>
  </section>

<?php include __DIR__ . '/partials/footer.php'; ?>
