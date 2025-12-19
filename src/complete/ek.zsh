_ek() {
  local cur
  cur="${COMP_WORDS[COMP_CWORD]}"

  COMPREPLY=($(ek __complete "${COMP_WORDS[@]:1}"))
}

complete -F _ek ek
