<?php
// Expects $activeNav (string) from the including page — one of:
// 'features', 'install', 'altstore', 'save', 'contact', or '' for none.
$activeNav = $activeNav ?? '';
function nav_class(string $name, string $active): string {
  return $name === $active ? ' class="active"' : '';
}
?>
  <nav id="top-nav">
    <a href="/index.php" class="nav-logo">
      <img src="/appIcon.webp" alt="PokéRogue Offline" />
      PokéRogue Offline
    </a>
    <ul class="nav-links">
      <li><a href="/features.php"<?php echo nav_class('features', $activeNav); ?>>Features</a></li>
      <li><a href="/install.php"<?php echo nav_class('install', $activeNav); ?>>Install</a></li>
      <li><a href="/altstore.php"<?php echo nav_class('altstore', $activeNav); ?>>AltStore</a></li>
      <li><a href="/save.php"<?php echo nav_class('save', $activeNav); ?>>Save Data</a></li>
      <li><a href="/contact.php"<?php echo nav_class('contact', $activeNav); ?>>Contact</a></li>
    </ul>
    <a href="https://github.com/PokeRogue-Offline/pokerogue-offline/releases/latest" class="nav-download">↓ Download</a>
    <button class="nav-hamburger" id="hamburger" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
  </nav>
  <div class="nav-mobile" id="mobile-menu">
    <a href="/features.php"<?php echo nav_class('features', $activeNav); ?> onclick="closeMenu()">Features</a>
    <a href="/install.php"<?php echo nav_class('install', $activeNav); ?> onclick="closeMenu()">Install</a>
    <a href="/altstore.php"<?php echo nav_class('altstore', $activeNav); ?> onclick="closeMenu()">AltStore</a>
    <a href="/save.php"<?php echo nav_class('save', $activeNav); ?> onclick="closeMenu()">Save Data</a>
    <a href="/contact.php"<?php echo nav_class('contact', $activeNav); ?> onclick="closeMenu()">Contact</a>
    <a href="https://github.com/PokeRogue-Offline/pokerogue-offline/releases/latest">↓ Download</a>
  </div>
