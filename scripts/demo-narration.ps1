$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$demoRoot = Split-Path $PSScriptRoot -Parent
$demoOutput = Join-Path $demoRoot 'data/demo'
$demoScenes = Get-Content -LiteralPath (Join-Path $demoRoot 'docs/demo-story.json') -Raw | ConvertFrom-Json
$demoVoice = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $demoVoice.SelectVoice('Microsoft Zira Desktop')
  $demoVoice.Rate = 1
  for ($demoIndex = 0; $demoIndex -lt $demoScenes.Count; $demoIndex++) {
    $demoFile = Join-Path $demoOutput ('voice-{0:D2}.wav' -f $demoIndex)
    $demoVoice.SetOutputToWaveFile($demoFile)
    $demoVoice.Speak($demoScenes[$demoIndex].narration)
    $demoVoice.SetOutputToNull()
  }
} finally { $demoVoice.Dispose() }
Write-Output 'Narration synthesized locally with Microsoft Zira.'
