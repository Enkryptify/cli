Register-ArgumentCompleter -CommandName ek -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $commandArgs = $commandAst.CommandElements |
        Select-Object -Skip 1 |
        ForEach-Object { $_.ToString() }

    $ekPath = (Get-Command ek.exe -ErrorAction SilentlyContinue).Source
    if (-not $ekPath) {
        $ekPath = "ek.exe"
    }

    try {
        & $ekPath __complete $commandArgs | ForEach-Object {
            if ($_) {
                [System.Management.Automation.CompletionResult]::new(
                    $_,
                    $_,
                    'ParameterValue',
                    $_
                )
            }
        }
    } catch {
        # Return empty completions on error
    }
}
