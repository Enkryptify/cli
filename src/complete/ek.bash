_ek_complete() {
  local IFS=$'\n'
  COMPREPLY=($(ek __complete "${COMP_WORDS[@]:1}"))
}

complete -F _ek_complete ek


