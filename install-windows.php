<?php
$pageTitle = "Windows Install | PokéRogue Offline";
$activeNav = 'install';
include __DIR__ . '/partials/head.php';
?>

  <div class="page-header">
    <p class="page-eyebrow">Getting Started</p>
    <h1 class="page-title">Install on <span>Windows</span></h1>
    <p class="page-subtitle">A portable EXE — no installation required.</p>
    <a href="/install.php" class="back-link">← Back to Install Options</a>
  </div>

  <div class="divider"><span class="divider-icon">✦</span></div>

  <section>
    <div class="install-grid">
      <div class="install-card windows-card">
        <div class="card-header">
          <div>
            <p class="card-num windows">Windows</p>
            <h3 class="card-title">Run the Portable EXE</h3>
          </div>
          <span class="badge badge-windows">Portable</span>
        </div>
        <p style="margin-bottom:1.25rem; color: var(--text-dim); font-size:0.97rem;">
          No installation needed — the EXE is a portable build. Just download and run.
        </p>
        <div class="steps">
          <div class="step-row"><span class="step-n">1</span><span>Go to the <a href="https://github.com/PokeRogue-Offline/pokerogue-offline/releases/latest" target="_blank">latest release</a> and download <code>PokeRogueOffline.exe</code></span></div>
          <div class="step-row"><span class="step-n">2</span><span>Double-click the file to run it</span></div>
          <div class="step-row"><span class="step-n">3</span><span>If Windows SmartScreen appears, click <strong>More info</strong> then <strong>Run anyway</strong> — this is expected for unsigned portable builds</span></div>
        </div>
        <div class="card-note windows-note">
          The EXE is unsigned. Windows Defender or SmartScreen may flag it on first run — this is a false positive. You can verify the file by checking the <a href="https://github.com/PokeRogue-Offline/pokerogue-offline/releases/latest" target="_blank">release page</a> SHA or building from source.
        </div>
      </div>
    </div>
  </section>

<?php include __DIR__ . '/partials/footer.php'; ?>
