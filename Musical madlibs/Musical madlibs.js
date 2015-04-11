if (Layer.root.width != 1024) {
	throw "This prototype is meant to be run in landscape on an iPad!"
}

// Global sound switch: disable to avoid annoyance during development!
var soundEnabled = true

var firstTrackSlotX = 23
var trackCenterY = 69
var trackSlotWidth = 118
var dotBaseline = trackCenterY - 85
var containerMargin = 10
var trackHeight = 150
var beatBorderColorSelected = new Color({white: 0.92})
var beatBorderColorUnselected = new Color({white: 0.80})
var restColorSelected = new Color({white: 0.984})
var restColorUnselected = new Color({white: 0.863})

var openTrackLength = 5
var totalTrackLength = 8
var track2Revealed = false

var track1 = makeTrack(openTrackLength, totalTrackLength)

var threeSnippet = makeSnippet("3 Brick - orange - C E G", 3, ["cat_e", "cat_gsharp", "cat_b"], track1)
threeSnippet.layer.position = Layer.root.position

var twoSnippet = makeSnippet("2 Brick - blue - E C", 2, ["dog_gsharp", "dog_e"], track1)
twoSnippet.layer.position = Layer.root.position
twoSnippet.layer.y -= 150

var track2 = makeTrack(openTrackLength, totalTrackLength)
track2.layer.originY = Layer.root.frameMaxY

var oneSnippet = makeSnippet("1 Brick - orange - C8", 1, ["cat_e8"], track2)
oneSnippet.layer.position = twoSnippet.layer.position

var twoSnippetAlt = makeSnippet("2 Brick - orange - F E", 2, ["cat_a", "cat_gsharp"], track2)
twoSnippetAlt.layer.position = twoSnippet.layer.position
twoSnippetAlt.layer.x += 300

//============================================================================================
// Audio

if (!soundEnabled) { Sound.prototype.play = function() {} }

var lastPlayTime = Timestamp.currentTimestamp()
var beatIndex = 0

// Using an action behavior instead of a heartbeat because heartbeats still don't dispose properly on reload. :/
Layer.root.behaviors = [
	new ActionBehavior({handler: function() {
		var totalNumberOfBeats = totalTrackLength * (track2Revealed ? 2 : 1)

		var beatLength = 0.3
		var dotAnimationLength = 0.18
		var currentTimestamp = Timestamp.currentTimestamp()
		var currentTrack = (beatIndex >= totalTrackLength) ? track2 : track1

		var beatIndexWithinTrack = beatIndex % totalTrackLength

		if (currentTimestamp - lastPlayTime > beatLength - dotAnimationLength) {
			var currentDot = currentTrack.slotDots[beatIndexWithinTrack]
			currentDot.animators.scale.target = new Point({x: 1, y: 1})
			currentDot.animators.y.target = dotBaseline + 30
			currentDot.animators.alpha.target = 1

			var lastBeatIndex = beatIndex - 1
			if (lastBeatIndex < 0) {
				lastBeatIndex = totalNumberOfBeats - 1
			}
			var lastDotTrack = (lastBeatIndex >= totalTrackLength) ? track2 : track1
			var lastDot = lastDotTrack.slotDots[lastBeatIndex % totalTrackLength]
			lastDot.animators.scale.target = new Point({x: 0, y: 0})
			lastDot.animators.y.target = dotBaseline
			lastDot.animators.alpha.target = 0
		}
		if (currentTimestamp - lastPlayTime > beatLength) {
			var foundSound = false
			currentTrack.trackEntries.forEach(function (value, key) {
				var beatWithinSnippet = beatIndexWithinTrack - value
				if (!foundSound && beatWithinSnippet >= 0 && beatWithinSnippet < key.blockCount && key.samples !== undefined) {
					var sound = new Sound({name: key.samples[beatWithinSnippet]})
					sound.play()
					foundSound = true
				}
			})
			if (!foundSound) {
				if (beatIndexWithinTrack < openTrackLength) {
					var sound = new Sound({name: "ta"})
					sound.play()
				}
			}

			lastPlayTime += beatLength
			beatIndex = (beatIndex + 1) % totalNumberOfBeats
		}
	}})
]


//============================================================================================
// Snippets

var highestSnippetZ = 0
function makeSnippet(name, size, samples, track) {
	var layer = new Layer({imageName: name, parent: track.layer})
	var snippet = {layer: layer, blockCount: size, samples: samples}

	layer.animators.scale.springSpeed = 40
	layer.animators.scale.springBounciness = 4
	layer.animators.position.springSpeed = 40
	layer.animators.position.springBounciness = 3

	layer.touchBeganHandler = function(sequence) {
		track.trackEntries.delete(snippet)
		highestSnippetZ++
		layer.zPosition = highestSnippetZ
		layer.animators.scale.target = new Point({x: 1.05, y: 1.05})
		layer.initialPosition = layer.position
	}
	layer.touchMovedHandler = function(sequence) {
		var newPosition = layer.initialPosition.add(sequence.currentSample.globalLocation.subtract(sequence.firstSample.globalLocation))
		var constrainedPosition = positionConstrainedWithinRect(layer, layer.parent.bounds)
		layer.position = constrainedPosition.add(newPosition.subtract(constrainedPosition).divide(2))
	}
	layer.touchEndedHandler = function(sequence) {
		var snippetOrigin = new Point({x: layer.position.x - layer.width / 2.0, y: layer.position.y - layer.height / 2.0})
		var slot = trackSlotForSnippetOrigin(snippetOrigin, layer.bounds.size, size)
		if (slot !== undefined) {
			var newOrigin = originForTrackSlot(slot, layer.bounds.size, size)
			if (canPutSnippetAtSlot(snippet, slot, track.trackEntries)) {
				track.trackEntries.set(snippet, slot)
			} else {
				var snippetCenter = snippetOrigin.y + layer.height / 2.0
				newOrigin = new Point({x: snippetOrigin.x, y: trackCenterY + layer.height * 0.75})
			}
			layer.animators.position.target = new Point({x: newOrigin.x + layer.width / 2.0, y: newOrigin.y + layer.height / 2.0})
		} else {
			layer.animators.position.target = positionConstrainedWithinRect(layer, layer.parent.bounds.inset({value: 20}))
		}
		layer.animators.scale.target = new Point({x: 1.0, y: 1.0})

		// Check to see if all the spots are full
		if (!track2Revealed && track === track1) {
			var beatsFilled = 0
			track.trackEntries.forEach(function(value, key) {
				beatsFilled += key.blockCount
			})
			if (beatsFilled == openTrackLength) {
				revealTrack2()
			}
		}
	}

	return snippet
}

function positionConstrainedWithinRect(layer, rect) {
	var constrainedX = clip({value: layer.position.x, min: rect.origin.x + layer.frame.size.width / 2.0, max: rect.origin.x + rect.size.width - layer.frame.size.width / 2.0})
	var constrainedY = clip({value: layer.position.y, min: rect.origin.y + layer.frame.size.height / 2.0, max: rect.origin.y + rect.size.height - layer.frame.size.height / 2.0})
	return new Point({x: constrainedX, y: constrainedY})
}

//============================================================================================
// Tracks

function makeTrack(openLength, totalLength) {
	var container = new Layer()
	container.frame = Layer.root.bounds.inset({value: containerMargin})
	container.backgroundColor = Color.clear
	container.cornerRadius = 22.5

	container.animators.frame.springSpeed = 30
	container.animators.frame.springBounciness = 5

	// Make all the slots.
	var beatSlots = [], restSlots = []
	for (var slotIndex = 0; slotIndex < totalLength; slotIndex++) {
		var isBeat = slotIndex < openLength
		var slot = makeSlot(isBeat)
		slot.parent = container
		slot.x = firstTrackSlotX + (slotIndex + 0.5) * trackSlotWidth
		slot.y = trackCenterY

		var targetSlotList = isBeat ? beatSlots : restSlots
		targetSlotList.push(slot)
	}

	var slotDots = makeSlotDots(container, openLength, totalLength)

	return {layer: container, slotDots: slotDots, trackEntries: new Map(), beatSlots: beatSlots, restSlots: restSlots, selected: true}
}

function makeSlot(isOpen) {
	var slot = new Layer()
	if (isOpen) {
		slot.border = beatBorder(true)
	} else {
		slot.backgroundColor = restColorSelected
	}
	slot.width = slot.height = 87
	slot.cornerRadius = 22.5
	slot.userInteractionEnabled = false
	return slot
}

function makeSlotDots(parentLayer, openLength, totalLength) {
	var slotDots = []
	for (var slotIndex = 0; slotIndex < totalLength; slotIndex++) {
		var dot = new Layer()
		dot.backgroundColor = Color.gray
		dot.width = dot.height = 13
		dot.cornerRadius = dot.width / 2.0
		dot.scale = 0.001
		dot.alpha = 0
		dot.y = dotBaseline
		dot.x = firstTrackSlotX + trackSlotWidth * (slotIndex + 0.5)
		dot.parent = parentLayer

		if (slotIndex >= openLength) {
			dot.border = new Border({width: 1.5, color: dot.backgroundColor})
			dot.backgroundColor = Color.clear
		}

		dot.animators.scale.springSpeed = 60
		dot.animators.scale.springBounciness = 0
		dot.animators.y.springSpeed = 50
		dot.animators.y.springBounciness = 0
		dot.animators.alpha.springSpeed = 40
		dot.animators.alpha.springBounciness = 0
		slotDots.push(dot)
	}
	return slotDots
}

function revealTrack2() {
	new Sound({name: "track_full"}).play()

	Layer.animate({duration: 0.2, curve: AnimationCurve.EaseOut, animations: function() {
		Layer.root.backgroundColor = new Color({white: 0.886})
	}})

	track1.layer.backgroundColor = Color.white
	setTrackSelected(track2, false)

	track1.layer.animators.frame.target = new Rect({x: track1.layer.originX, y: track1.layer.originY, width: track1.layer.width, height: track1.layer.height - trackHeight})
	track2.layer.animators.frame.target = new Rect({x: track2.layer.originX, y: track2.layer.originY - trackHeight, width: track2.layer.width, height: track2.layer.height - trackHeight})

	track2Revealed = true
}

function selectTrack1() {
	track1.layer.animators.frame.target = new Rect({x: track1.layer.originX, y: track1.layer.originY, width: track1.layer.width, height: Layer.root.height - trackHeight - containerMargin * 2})
	track2.layer.animators.frame.target = new Rect({x: track2.layer.originX, y: track1.layer.animators.frame.target.maxY + containerMargin, width: track2.layer.width, height: trackHeight - containerMargin})

	// Hmmm... the backgroundColor dynamic animator is being bouncy even when I tell it not to be.
	Layer.animate({duration: 0.3, curve: AnimationCurve.EaseOut, animations: function() {
		setTrackSelected(track1, true)
		setTrackSelected(track2, false)
	}})
}

function selectTrack2() {
	track1.layer.animators.frame.target = new Rect({x: track1.layer.originX, y: track1.layer.originY, width: track1.layer.width, height: trackHeight - containerMargin})
	track2.layer.animators.frame.target = new Rect({x: track2.layer.originX, y: trackHeight + containerMargin, width: track2.layer.width, height: Layer.root.height - trackHeight - containerMargin * 2})

	// Hmmm... the backgroundColor dynamic animator is being bouncy even when I tell it not to be.
	Layer.animate({duration: 0.3, curve: AnimationCurve.EaseOut, animations: function() {
		setTrackSelected(track1, false)
		setTrackSelected(track2, true)
	}})
}

function setTrackSelected(track, selected) {
	track.selected = selected
	track.layer.userInteractionEnabled = selected
	track.layer.backgroundColor = selected ? Color.white : Color.clear
	track.beatSlots.forEach(function(slot) { slot.border = beatBorder(selected) })
	track.restSlots.forEach(function(slot) { slot.backgroundColor = selected ? restColorSelected : restColorUnselected })
}

function beatBorder(selected) {
	return new Border({width: 4, color: selected ? beatBorderColorSelected : beatBorderColorUnselected})
}

var touchedTrack = null
Layer.root.touchBeganHandler = function(touchSequence) {
	[track1, track2].forEach(function(t) {
		if (t.layer.containsGlobalPoint(touchSequence.currentSample.globalLocation) && !t.selected) {
			setTrackHighlighted(t, true)
			touchedTrack = t
		}
	})
}

Layer.root.touchMovedHandler = function(touchSequence) {
	if (touchedTrack !== null) {
		setTrackHighlighted(touchedTrack, touchedTrack.layer.containsGlobalPoint(touchSequence.currentSample.globalLocation))
	}
}

Layer.root.touchEndedHandler = function(touchSequence) {
	if (touchedTrack !== null) {
		setTrackHighlighted(touchedTrack, false)
		if (touchedTrack.layer.containsGlobalPoint(touchSequence.currentSample.globalLocation)) {
			if (touchedTrack === track1) {
				selectTrack1()
			} else {
				selectTrack2()
			}
		}
		touchedTrack = null
	}
}

Layer.root.touchCancelledHandler = function(touchSequence) {
	if (touchedTrack !== null) {
		setTrackHighlighted(touchedTrack, false)
		touchedTrack = null
	}
}

function setTrackHighlighted(track, highlighted) {
	Layer.animate({duration: 0.15, curve: AnimationCurve.EaseOut, animations: function() {
		track.layer.backgroundColor = highlighted ? new Color({white: 1.0, alpha: 0.5}) : Color.clear
	}})
}

//============================================================================================
// Snippet + slot arithmetic

function canPutSnippetAtSlot(snippet, slot, trackEntries) {
	var result = true
	if (slot + snippet.blockCount > openTrackLength) {
		return false
	}
	trackEntries.forEach(function(value, key) {
		if (key === snippet) {
			return
		}
		var isLeftOfCurrentSnippet = (slot + snippet.blockCount) <= value
		var isRightOfCurrentSnippet = slot >= (value + key.blockCount)
		result = result && (isLeftOfCurrentSnippet || isRightOfCurrentSnippet)
	})
	return result
}

function offsetWithinTrackSlot(snippetWidth, blockCount) {
	return ((blockCount * trackSlotWidth) - snippetWidth) / 2.0
}

function trackSlotForSnippetOrigin(snippetOrigin, snippetSize, blockCount) {
	if (snippetOrigin.y > (trackCenterY - snippetSize.height * 1.25) && (snippetOrigin.y + snippetSize.height) < (trackCenterY + snippetSize.height * 1.25)) {
		var shiftWithinSlot = offsetWithinTrackSlot(snippetSize.width, blockCount)
		var distanceFromTrackStart = Math.max(snippetOrigin.x - firstTrackSlotX, 0)
		var trackSlot = Math.round((distanceFromTrackStart - shiftWithinSlot) / trackSlotWidth)
		if (trackSlot >= 0 && trackSlot <= (totalTrackLength - blockCount)) {
			return trackSlot
		} else {
			return undefined
		}
	} else {
		return undefined
	}
}

function originForTrackSlot(trackSlot, size, blockCount) {
	var originX = trackSlot * trackSlotWidth + firstTrackSlotX + offsetWithinTrackSlot(size.width, blockCount)
	return new Point({x: originX, y: trackCenterY - size.height / 2.0})
}