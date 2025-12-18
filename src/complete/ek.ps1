$binaryNames = @('ek', 'ek-darwin-arm64', 'ek-darwin-x64', 'ek-linux-arm64', 'ek-linux-x64', 'ek-win-x64', 'ek-win-arm64')

foreach ($name in $binaryNames) {
  Register-ArgumentCompleter -CommandName $name -ScriptBlock {
    param($commandName, $wordToComplete, $cursorPosition)
    
    & $commandName __complete | ForEach-Object {
      [System.Management.Automation.CompletionResult]::new(
        $_,
        $_,
        'ParameterValue',
        $_
      )
    }
  }
}
