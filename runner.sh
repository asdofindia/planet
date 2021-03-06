#!/bin/bash

REMOTENAME="origin"
SOURCE="master"
PAGES="gh-pages"
DEBUG=0

# do not configure anything below this

if [ "$1" = "d" ]
then
  DEBUG=1
fi

REMOTEURL=$(git config --get remote.$REMOTENAME.url)

if [ $DEBUG -eq 0 ]
then
  echo "Updating code from $REMOTENAME"
  git pull $REMOTENAME $SOURCE
  if [ $? -ne 0 ]
  then
    echo "Please make sure you have configured REMOTENAME and other variables correctly in runner.sh. Also avoid merge conflicts."
    [ $DEBUG -ne 0 ] || exit
  fi
fi

echo "Beginning generation"
node generator.js
if [ $? -ne 0 ]
then
    echo "have you done npm install?"
    [ $DEBUG -ne 0 ] || exit
fi

rm -rf dist
git init dist
mv index.html dist/
mv index.xml dist/
# mv index.atom dist/
cp style.css dist/

cd dist

touch .nojekyll
git remote add $REMOTENAME $REMOTEURL
git checkout -b $PAGES
git add --all
git commit -m "Updated"

if [ $DEBUG -eq 0 ]
then
    git push $REMOTENAME $PAGES --force
else
    # git push $REMOTENAME $PAGES --force --dry-run
    echo "starting server"
    http-server
fi

echo "Finished"
