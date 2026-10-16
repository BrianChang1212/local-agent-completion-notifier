'use strict';

function getReminderMarkerPath(eventPath) {
  return `${eventPath}.reminded`;
}

async function claimReminderMarker(fileSystem, eventPath) {
  const markerPath = getReminderMarkerPath(eventPath);
  let marker;
  try {
    marker = await fileSystem.open(markerPath, 'wx');
  } catch (error) {
    if (error && ['EEXIST', 'ENOENT'].includes(error.code)) return null;
    throw error;
  }
  await marker.close();
  try {
    await fileSystem.stat(eventPath);
  } catch (error) {
    await releaseReminderMarker(fileSystem, eventPath);
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
  return markerPath;
}

async function releaseReminderMarker(fileSystem, eventPath) {
  try {
    await fileSystem.unlink(getReminderMarkerPath(eventPath));
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
  }
}

module.exports = { claimReminderMarker, releaseReminderMarker };
