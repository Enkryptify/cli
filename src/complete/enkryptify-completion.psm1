Register-ArgumentCompleter -CommandName ek -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $args = $commandAst.CommandElements |
        Select-Object -Skip 1 |
        ForEach-Object { $_.ToString() }

    & ek __complete $args | ForEach-Object {
        [System.Management.Automation.CompletionResult]::new(
            $_,
            $_,
            'ParameterValue',
            $_
        )
    }
}
