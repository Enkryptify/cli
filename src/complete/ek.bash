_ek_complete() {
  local cur prev words
  COMPREPLY=()
  words=("${COMP_WORDS[@]}")
  cur="${COMP_WORDS[COMP_CWORD]}"

  local completions
  completions=$(ek __complete "${words[@]:1}")

  COMPREPLY=( $(compgen -W "$completions" -- "$cur") )
}

complete -F _ek_complete ek
