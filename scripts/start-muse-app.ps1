param(
  [ValidateSet('Prompt', 'App', 'Browser')]
  [string]$LaunchMode = 'Prompt'
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$serverDir = Join-Path $root 'server'
$serverEntry = Join-Path $serverDir 'dist\server.js'
$logDir = Join-Path $root 'tmp'
$origin = 'http://127.0.0.1:3000'
$appUrl = "$origin/today"

if (-not (Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

function Test-MuseServer {
  try {
    $response = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

function Resolve-Browser {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }

  return $null
}

function Show-MuseMessage($message, $title = 'Muse') {
  try {
    $shell = New-Object -ComObject WScript.Shell
    $shell.Popup($message, 0, $title, 48) | Out-Null
  } catch {
    Write-Error $message
  }
}

function Resolve-LaunchMode {
  if ($LaunchMode -ne 'Prompt') {
    return $LaunchMode
  }

  try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'Muse'
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.ShowInTaskbar = $true
    $form.TopMost = $true
    $form.ClientSize = New-Object System.Drawing.Size(320, 120)

    $label = New-Object System.Windows.Forms.Label
    $label.Text = 'Choose how to open Muse:'
    $label.AutoSize = $true
    $label.Location = New-Object System.Drawing.Point(24, 22)
    $form.Controls.Add($label)

    $appButton = New-Object System.Windows.Forms.Button
    $appButton.Text = 'App mode'
    $appButton.Size = New-Object System.Drawing.Size(120, 32)
    $appButton.Location = New-Object System.Drawing.Point(32, 68)
    $appButton.Add_Click({
      $form.Tag = 'App'
      $form.Close()
    })
    $form.Controls.Add($appButton)

    $browserButton = New-Object System.Windows.Forms.Button
    $browserButton.Text = 'Browser mode'
    $browserButton.Size = New-Object System.Drawing.Size(120, 32)
    $browserButton.Location = New-Object System.Drawing.Point(168, 68)
    $browserButton.Add_Click({
      $form.Tag = 'Browser'
      $form.Close()
    })
    $form.Controls.Add($browserButton)

    $form.AcceptButton = $appButton
    $form.CancelButton = $appButton
    [void]$form.ShowDialog()

    if ($form.Tag -eq 'Browser') {
      return 'Browser'
    }

    return 'App'
  } catch {
    $shell = New-Object -ComObject WScript.Shell
    $choice = $shell.Popup(
      "Open Muse in browser mode?`n`nYes: Browser mode`nNo: App mode`nCancel: Exit",
      0,
      'Muse',
      35
    )

    if ($choice -eq 6) {
      return 'Browser'
    }

    if ($choice -eq 7) {
      return 'App'
    }

    exit 0
  }
}

if (-not (Test-Path $serverEntry)) {
  Show-MuseMessage "Muse production server is missing: $serverEntry`nRun npm run build once, then open Muse again."
  exit 1
}

if (-not (Test-MuseServer)) {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) {
    Show-MuseMessage 'Node.js was not found. Install Node.js, then open Muse again.'
    exit 1
  }

  $env:PORT = '3000'
  $env:SERVER_ORIGIN = $origin
  $env:WEB_APP_ORIGIN = $origin

  Start-Process `
    -FilePath $node `
    -ArgumentList @($serverEntry) `
    -WorkingDirectory $serverDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logDir 'muse-app-server.out.log') `
    -RedirectStandardError (Join-Path $logDir 'muse-app-server.err.log')

  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-MuseServer) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    Show-MuseMessage "Muse server did not become ready. Check tmp\muse-app-server.err.log."
    exit 1
  }
}

$browser = Resolve-Browser
if (-not $browser) {
  Show-MuseMessage 'Google Chrome was not found. Install Chrome to run Muse as an app window.'
  exit 1
}

$resolvedLaunchMode = Resolve-LaunchMode
$browserArguments = @(
  '--new-window',
  '--window-size=1440,960',
  '--disable-features=Translate'
)

if ($resolvedLaunchMode -eq 'App') {
  $browserArguments += "--app=$appUrl"
} else {
  $browserArguments += $appUrl
}

Start-Process `
  -FilePath $browser `
  -ArgumentList $browserArguments
