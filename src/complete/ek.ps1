$binaryNames = @('ek', 'ek-darwin-arm64', 'ek-darwin-x64', 'ek-linux-arm64', 'ek-linux-x64', 'ek-win-x64', 'ek-win-arm64')

foreach ($name in $binaryNames) {
  Register-ArgumentCompleter -CommandName $name -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    
    $commandContext = $commandAst.ToString() -split '\s+' | Select-Object -Skip 1
        & $name __complete $commandContext | ForEach-Object {
      [System.Management.Automation.CompletionResult]::new(
        $_,
        $_,
        'ParameterValue',
        $_
      )
    }
  }
}
