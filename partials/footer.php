<?php
// Optional variables from the including page:
//   $footerExtra — raw HTML for an extra disclaimer paragraph shown above
//                  the standard one (e.g. the iOS guide's CC attribution).
//   $footerLinks — bool, whether to show the Privacy/TOS links (default
//                  true; pages that ARE privacy/tos usually still show them
//                  fine, but set to false to omit if ever needed).
$footerLinks = $footerLinks ?? true;
?>
<?php if (!empty($footerExtra)): ?>
  <div class="disclaimer">
    <?php echo $footerExtra; ?>
  </div>
<?php endif; ?>

  <div class="disclaimer"<?php echo !empty($footerExtra) ? ' style="margin-top:0.5rem;"' : ''; ?>>
    PokéRogue Offline is an unofficial fan project and is not affiliated with or endorsed by the PokéRogue team.
    PokéRogue is developed by <a href="https://github.com/pagefaultgames" target="_blank">PageFaultGames</a>.
    This app is intended for personal use only.<?php if ($footerLinks): ?> <a href="/privacy.php">Privacy Policy</a> / <a href="/tos.php">TOS</a><?php endif; ?>
  </div>

  <script src="/assets/main.js?v=<?php echo filemtime(__DIR__ . '/../assets/main.js'); ?>"></script>
</body>
</html>
