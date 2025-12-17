Register-ArgumentCompleter -CommandName ek -ScriptBlock {
  param($commandName, $wordToComplete, $cursorPosition, $commandAst, $fakeBoundParameters)

  # Get all command elements (ek command + arguments)
  $words = $commandAst.CommandElements | ForEach-Object { $_.ToString() }
  
  # Skip the command name itself, pass the rest to __complete
  # Handle case where there are no arguments yet
  if ($words.Length -gt 1) {
    $args = $words[1..($words.Length - 1)]
  } else {
    $args = @()
  }
  
  # Get completions from ek CLI
  try {
    $allCompletions = ek __complete $args 2>$null
    if ($null -eq $allCompletions) { return }
    
    # Filter completions based on wordToComplete (case-insensitive)
    $completions = $allCompletions | Where-Object { 
      $_ -like "$wordToComplete*" -or [string]::IsNullOrEmpty($wordToComplete)
    }
    
    $completions | ForEach-Object {
      [System.Management.Automation.CompletionResult]::new(
        $_,
        $_,
        'ParameterValue',
        $_
      )
    }
  } catch {
    # Silently fail if ek command is not available or errors
  }
}
