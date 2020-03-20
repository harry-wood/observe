#!/usr/bin/env bash

ASSETS_DIR=${PWD}/app/assets
IOS_DIR=${PWD}/ios/Observe/Images.xcassets
IOS_TEMP=${PWD}/ios/Observe/Images.xcassets-temp
ANDROID_DIR=${PWD}/android/app/src/main/res/drawable-xxhdpi

ICON_DIRS="${ASSETS_DIR}/fontawesome/*.png
${ASSETS_DIR}/maki/*.png
${ASSETS_DIR}/temaki/*.png"

# move the existing iOS imageset to a temp folder
mv $IOS_DIR $IOS_TEMP

# create a new ios assets dir
mkdir $IOS_DIR

# copy over app icon and metadata
cp -r $IOS_TEMP/AppIcon.appiconset $IOS_DIR
cp $IOS_TEMP/Contents.json $IOS_DIR

# remove all existing links from android
rm -rf $ANDROID_DIR
mkdir $ANDROID_DIR

for file in $ICON_DIRS
do
  echo "Linking $file"

  # android
  ln -s $file $ANDROID_DIR

  # ios
  FILENAME=`basename $file`
  IMAGESET_DIRNAME=`basename $file .png`
  IMAGESET_PATH=${IOS_DIR}/${IMAGESET_DIRNAME}.imageset
  CONTENTS_FILEPATH=${IMAGESET_PATH}/Contents.json

  mkdir $IMAGESET_PATH
  node ./scripts/create-ios-icon-contents.js $CONTENTS_FILEPATH $FILENAME
  ln -s $file $IMAGESET_PATH
done

# remove temp
rm -rf $IOS_TEMP