
_ek_complete() {
  local -a suggestions
  suggestions=("${(@f)$(ek __complete ${words[2,-1]})}")
  _describe 'values' suggestions
}

compdef _ek_complete ek

