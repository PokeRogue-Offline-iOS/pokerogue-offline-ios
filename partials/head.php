<?php
// Expected variables from the including page:
//   $pageTitle       (string, required)
//   $pageDescription (string, optional) — reserved for a future <meta description>
//   $activeNav       (string, optional) — passed through to nav.php for link highlighting
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title><?php echo htmlspecialchars($pageTitle ?? 'PokéRogue Offline'); ?></title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="icon" type="image/png" href="/favicon.png" />
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;900&family=Crimson+Pro:ital,wght@0,300;0,400;0,600;1,300;1,400&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/assets/style.css?v=<?php echo filemtime(__DIR__ . '/../assets/style.css'); ?>" />
</head>
<body>
<?php include __DIR__ . '/nav.php'; ?>
