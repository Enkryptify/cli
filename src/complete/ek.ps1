Register-ArgumentCompleter -CommandName ek -ScriptBlock {
  param($commandName, $wordToComplete, $cursorPosition)

  ek __complete | ForEach-Object {
    [System.Management.Automation.CompletionResult]::new(
      $_,
      $_,
      'ParameterValue',
      $_
    )
  }
}
