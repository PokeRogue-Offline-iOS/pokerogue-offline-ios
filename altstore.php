<?php
$pageTitle = "AltStore | PokéRogue Offline";
$activeNav = 'altstore';
include __DIR__ . '/partials/head.php';
?>

  <div class="page-header">
    <p class="page-eyebrow">AltStore Compatible</p>
    <h1 class="page-title">Add to <span>AltStore</span></h1>
    <p class="page-subtitle">Get notified of updates automatically by adding the source repo to AltStore or SideStore.</p>
    <a href="/index.php" class="back-link">← Back to Home</a>
  </div>

  <div class="divider"><span class="divider-icon">✦</span></div>

  <section>
    <div class="altstore-box">
      <p style="margin-bottom:0.5rem; color: var(--text);">Add the following URL as a source in AltStore or SideStore:</p>
      <code class="repo-url">https://pokerogue-offline.github.io/pokerogue-offline/repo.json</code>
      <p style="color: var(--text-dim); font-size:0.95rem; font-style:italic;">
        Note: AltStore support is newly added and hasn't been fully tested yet. If you run into any issues, please report them in the Discord channel below.
      </p>
      <div style="margin-top:1.75rem;">
        <p class="steps-sub-title">How to add a source in AltStore</p>
        <div class="steps">
          <div class="step-row"><span class="step-n">1</span><span>Open AltStore and go to the <strong>Browse</strong> tab</span></div>
          <div class="step-row"><span class="step-n">2</span><span>Tap <strong>Sources</strong> in the top right corner</span></div>
          <div class="step-row"><span class="step-n">3</span><span>Tap <strong>+</strong> and paste the URL above</span></div>
          <div class="step-row"><span class="step-n">4</span><span>PokéRogue Offline will appear in Browse — tap to install</span></div>
        </div>
      </div>
    </div>
  </section>

<?php include __DIR__ . '/partials/footer.php'; ?>
