#!/bin/bash

# GitHub workflow handles invalidating Pull Requests after 3 hours.
#
# It will only invalidate open, non-draft pull requests that are
# 3 hours after successfully passing build checks and
# out-of-date with their target branch
#
# Possible cases
# 1. PRs that are out-of-date with their target branch and
#   that have any of passed build checks which happened
#   more than 3 hours ago will be invalidated
# 2. PRs that are up-to-date with their target branch
#   will not be invalidated
# 3. PRs that are out-of-date with their target branch and
#   have passed all build checks within 3 hours will not
#   be invalidated

if [[ "" == $token ]]; then
  echo Missing the environment variable "$token"
  exit
fi

oauth=$token
shouldDebug=false

if [[ "" != $debug ]]; then
  shouldDebug=true
  echo Initializing debug log level
fi

# Get all active PRs
# https://docs.github.com/en/rest/reference/pulls#list-pull-requests
prs=$(curl -s \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Authorization: token $oauth" \
  https://api.github.com/repos/imodeljs/imodeljs/pulls)

_jq() {
  echo ${1} | base64 --decode | jq -r ${2}
}

function log() {
  if [[ $shouldDebug == true  ]]; then
    echo "${1}"
  fi
}

declare -A listSha

# Get head sha on master branch
masterCommit=$(curl -s \
  -H "Accept: application/vnd.github.v3+json" \
  -H "Authorization: token $oauth" \
  https://api.github.com/repos/imodeljs/imodeljs/commits/master)

masterHeadCommit=$(echo ${masterCommit} | jq -r '. | @base64')
masterSha=$(_jq  ${masterHeadCommit} '.sha')

listSha["master"]=${masterSha}
echo "Master SHA is ${listSha["master"]}"

for pr in $(echo "${prs}" | jq -r '.[] | @base64'); do
  log "$(_jq ${pr} '.title') (#$(_jq ${pr} '.number'))"

  if [[ "open" != $(_jq ${pr} '.state') ]] || [[ "true" == $(_jq ${pr} '.draft') ]]; then
    log "  Skipping due to state=$(_jq ${pr} '.state') and draft=$(_jq ${pr} '.draft')."
    continue
  fi

  ref=$(_jq ${pr} '.base.ref')
  sha=$(_jq ${pr} '.base.sha')

  shaToCompare=${listSha[${ref}]}

  # Check if shaToCompare exists
  # if it doesn't, find the shaToCompare and save it to listSha
  # to keep track of head sha that has been used alreday
  if [[ $shaToCompare == "" ]]
  then
    refCommit=$(curl -s \
              -H "Accept: application/vnd.github.v3+json" \
              -H "Authorization: token $oauth" \
              https://api.github.com/repos/imodeljs/imodeljs/commits/${ref})
    refHeadCommit=$(echo ${refCommit} | jq -r '. | @base64')
    refHeadSha=$(_jq  ${refHeadCommit} '.sha')
    listSha[${ref}]=${refHeadSha}
    shaToCompare=$refHeadSha
  fi

  # Compare base sha with the target branch head sha
  log "  Target branch, ${ref}, commit sha is ${shaToCompare} and PR is on ${sha}"
  if [[ $shaToCompare == $sha ]]
    then
    log "  Skipping since it is up-to-date with the target branch, ${ref}."
    continue
  fi

  ## Check if the PR is even 3 hours old. If so, no reason to check statuses.
  prCreationTime=$(_jq ${pr} '.created_at')
  branch=$(_jq ${pr} '.head.ref')
  branchLatest=$(curl -s \
              -H "Accept: application/vnd.github.v3+json" \
              -H "Authorization: token $oauth" \
              https://api.github.com/repos/imodeljs/imodeljs/branches/${branch})
  branchLatestCommit=$(echo ${branchLatest} | jq -r '. | @base64')
  lastPushedTime=$(_jq ${branchLatestCommit} '.commit.commit.author.date')

  log "  PR created at ${prCreationTime}."
  log "  Last pushed at ${lastPushedTime}."

  currentTime=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  createdTooOld=$(node -e "const lutPlus3=new Date('$prCreationTime'); lutPlus3.setHours(lutPlus3.getHours()+3); console.log((new Date('$currentTime') - lutPlus3) > 0)")
  pushedTooOld=$(node -e "const lutPlus3=new Date('$lastPushedTime'); lutPlus3.setHours(lutPlus3.getHours()+3); console.log((new Date('$currentTime') - lutPlus3) > 0)")
  if [[ $createdTooOld == false || $pushedTooOld == false ]]; then
    log "  Skipping since this PR has been created or updated within the past 3 hours."
    continue
  fi

  # Get all statuses of the PR
  #   e.g. https://api.github.com/repos/imodeljs/imodeljs/statuses/c29a168b6a201052098ea6743041868bfbadaa4f
  statuses=$(curl -s \
              -H "Accept: application/vnd.github.v3+json" \
              -H "Authorization: token $oauth" \
              $(_jq ${pr} '.statuses_url'))

  for status in $(echo "${statuses}" | jq -r '.[] | @base64'); do
    if [[ "success" != $(_jq  ${status} '.state') ]] || [[ "license/cla" == $(_jq  ${status} '.context') ]]; then
      log "  Skipping $(_jq  ${status} '.context') with state $(_jq  ${status} '.state')."
      continue
    fi

    buildUpdatedTime=$(_jq  ${status} '.updated_at')
    tooOld=$(node -e "const lutPlus3=new Date('$buildUpdatedTime'); lutPlus3.setHours(lutPlus3.getHours()+3); console.log((new Date('$currentTime') - lutPlus3) > 0)")
    if [[ $tooOld == false ]]; then
      log "  Skipping $(_jq  ${status} '.context') it was updated within the past 3 hours."
      continue
    fi

    echo "  The PR $(_jq ${pr} '.title') has build $(_jq  ${status} '.context') that is older than 3 hours. Invalidating..."

    updateUrl=https://api.github.com/repos/imodeljs/imodeljs/statuses/$(_jq ${pr} '.head.sha')
    target_url=$(_jq  ${status} '.target_url')

    curl \
      -X POST \
      -H "Accept: application/vnd.github.v3+json" \
      -H "Authorization: token $oauth" \
      $updateUrl \
      -d '{"state":"failure","target_url":"'$(_jq  ${status} '.target_url')'","description":"The build hit the 3 hour threshold. Please re-queue the build.","context":"'$(_jq  ${status} '.context')'"}'

    break
  done
done
