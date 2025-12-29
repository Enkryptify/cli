Register-ArgumentCompleter -CommandName ek -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    try {
        $cmdArgs = $commandAst.CommandElements |
            Select-Object -Skip 1 |
            ForEach-Object { $_.ToString() }

        $ekPath = $null
        
        $ekCmd = Get-Command ek -ErrorAction SilentlyContinue
        if ($ekCmd) {
            $ekPath = $ekCmd.Source
            if (-not $ekPath) {
                $ekPath = $ekCmd.Path
            }
        }
        
        if (-not $ekPath) {
            $moduleDir = Split-Path -Parent $PSScriptRoot
            $possiblePath = Join-Path $moduleDir "ek.exe"
            if (Test-Path $possiblePath) {
                $ekPath = $possiblePath
            }
        }
        
        if (-not $ekPath) {
            $scoopShim = Join-Path $env:USERPROFILE "scoop\shims\ek.exe"
            if (Test-Path $scoopShim) {
                $ekPath = $scoopShim
            }
        }

        if (-not $ekPath) {
            return
        }

        $output = & $ekPath __complete $cmdArgs 2>$null
        
        if ($output) {
            $output | Where-Object { $_ -and $_.Trim() } | ForEach-Object {
                $trimmed = $_.Trim()
                if ($trimmed -and $trimmed -notmatch '^\s*$') {
                    [System.Management.Automation.CompletionResult]::new(
                        $trimmed,
                        $trimmed,
                        'ParameterValue',
                        $trimmed
                    )
                }
            }
        }
    } catch {
    }
}
