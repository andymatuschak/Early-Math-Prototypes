/*

Basic Mechanix
	
This prototype is intended to test out the basic mechanisms
of walking, gathering numbers, and laying them down.

We'll just focus on the forest for now.

*/

//setting up some strings to point to assets so that they are all in one place
const strBgLayer = "trees"
const numFirstBGLayer = 0
const numBGLayers = 4
const strCharLayer = "lilperson"
let numFirstCharLayer = 0
const numCharFrames = 60
const numCharLayers = 1;
const charInitialX = 320

Layer.root.backgroundColor = new Color({hue: 0.52, saturation: 0.17, brightness: 0.94})


//set up BG layers
var bgParentLayer = new Layer({name:"bgParent"}) 
for (let i = numFirstBGLayer; i < numFirstBGLayer+numBGLayers; i++) {
	const bgLayerName = strBgLayer + i
	var bgLayer = new Layer({parent: bgParentLayer, imageName: bgLayerName})
	bgLayer.x = bgLayer.width/2 
	bgLayer.y = bgLayer.height/2
}

const foregroundLayer = bgParentLayer.sublayers[bgParentLayer.sublayers.length - 1]

const xPositionIndicator = makeXPositionIndicator()
xPositionIndicator.alpha = 0

//set up initial character layer (no static animation yet. eventually: at least blinking!)
const charLayerName = strCharLayer + "_" + pad(numFirstCharLayer, 2)
var charParentLayer = new Layer({name:"charParent", parent: foregroundLayer}) 
var charLayer = new Layer({parent: charParentLayer, imageName: charLayerName})
charLayer.origin = Point.zero
charParentLayer.size = charLayer.size
charParentLayer.x = charInitialX
charParentLayer.y = 640


let characterTargetX = charParentLayer.x
let cameraOriginX = 0
let characterStepSize = 0 // starts at 0, smoothly accelerates up to a maximum

//setting up a basic tap to parallax test with basic touch handler
Layer.root.touchBeganHandler = function(touchSequence) { 
	characterTargetX = touchSequence.currentSample.locationInLayer(charParentLayer.parent).x
}

let characterWalkingStopTime = undefined
Layer.root.behaviors = [
	new ActionBehavior({handler: () => {
		// Camera and player movement!

		const cameraEdgeFraction = 0.6 // in unit screen space, how far along the screen is the line where the camera moves at the same speed as the player?
		const cameraEdgeSmoothingSizeFraction = 0.07 // in unit screen space, how wide is the region before cameraEdgeFraction where the camera accelerates?
		const maximumStepSize = 3 // the maximum speed (pts/frame) at which the player can move
		const maximumCameraSpeed = maximumStepSize // pts/frame
		const minimumCameraSpeed = 1 // pts/frame

		// First, we'll move the camera.
		// Look at the right edge first. How near are we to the line? Map that nearness to the camera speed, ramping up over the smoothing region.
		const cameraRightDelta = charParentLayer.globalPosition.x - Layer.root.width * cameraEdgeFraction
		let cameraSpeed = clip({
			value: map({value: cameraRightDelta, fromInterval: [-Layer.root.width * cameraEdgeSmoothingSizeFraction, 0], toInterval: [0, maximumCameraSpeed]}),
			min: 0,
			max: maximumCameraSpeed
		})
		if (cameraSpeed === 0) {
			// Try the left edge.
			const cameraLeftDelta = Layer.root.width * (1.0 - cameraEdgeFraction) - charParentLayer.globalPosition.x
			cameraSpeed = clip({
				value: map({value: cameraLeftDelta, fromInterval: [-Layer.root.width * cameraEdgeSmoothingSizeFraction, 0], toInterval: [0, -maximumCameraSpeed]}),
				min: -maximumCameraSpeed,
				max: 0
			})
		}

		// If the camera's moving (and has room to move)...
		if (Math.abs(cameraSpeed) >= 1 && (cameraSpeed > 0 || foregroundLayer.originX < 0)) {
			let i = 0;
			for (var layerIndex = 0; layerIndex < bgParentLayer.sublayers.length; layerIndex++) {
				const layer = bgParentLayer.sublayers[layerIndex]
				// Closer planes move the most; further-back planes move the least.
				var planeMovement = map({value: layerIndex, fromInterval: [0, bgParentLayer.sublayers.length - 1], toInterval: [Math.sign(cameraSpeed) * 1, cameraSpeed]})
				layer.x = layer.x - planeMovement
				i++ 
			}
		}

		// Move the character towards its target.
		const dx = characterTargetX - charParentLayer.x
		if (Math.abs(dx) > maximumStepSize) {
			characterStepSize = clip({value: characterStepSize + Math.sign(dx), min: -maximumStepSize, max: maximumStepSize})
			charParentLayer.x += characterStepSize
			charLayer.scaleX = dx > 0 ? 1 : -1

			// Animate the character
			numFirstCharLayer = (numFirstCharLayer + 1) % numCharFrames

			characterWalkingStopTime = undefined
			Layer.animate({duration: 0.3, curve: AnimationCurve.EaseOut, animations: () => {
				xPositionIndicator.alpha = 0.7
			}})
		} else {
			numFirstCharLayer = 0

			if (characterWalkingStopTime === undefined) {
				characterWalkingStopTime = Timestamp.currentTimestamp()
			}

			if (Timestamp.currentTimestamp() - characterWalkingStopTime > 0.7) {
				Layer.animate({duration: 0.3, animations: () => {
					xPositionIndicator.alpha = 0
				}})
			}
		}

		charLayer.image = new Image({name: strCharLayer + "_" + pad(numFirstCharLayer, 2)})

		xPositionIndicator.setX(charParentLayer.x, charParentLayer.globalPosition.x)
	}})
]

//-------------------------------------------------
// Bricks
//-------------------------------------------------

/** 
	Create a brick with the given arguments object. Valid arguments are:

	length: how many blocks are in this brick? Must be >= 1.
	isUnified: a boolean to indicate if the brick looks like one unified brick or individual blocks in a row. defaults to blocks in a row if you don't specify.
	isEmpty: a boolean to indicate if the brick starts "empty" (all its blocks are clear and just have dashed outline). Use this for gathering. If not specified, it defaults to false.
	
	color: what colour are the blocks?
	borderColor: what colour is the border? will use `color` if none is provided.
	borderWidth: defaults to 0 if you don't provide one.
	
	size: how big is each block? defaults to 50 if you don't provide one. (note: this is just one number because blocks are square)
	isVertical: is the brick vertical? if false/unspecified, defaults to horizontal
	cornerRadius: defaults to 8 if you don't provide one.
	
	blocks: an array of existing blocks. defaults to undefined, in that case blocks are generated. If you provide your own, those blocks are used instead.

	The returned brick already has drag and drop enabled and will do the right thing to stay under the finger as it is dragged.

	You can optionally provide a dragDidBeginHandler, dragDidMoveHandler, and/or a dragDidEndHandler to get a callback on those events to do whatever you please. For example, you might want to check if the brick was dropped in a certain location.
	
	NOTE: The returned Brick object is *not* a Layer itself, but it *has* a layer you can access with `.container` property. So if you need to treat a brick like a layer, you've first got to ask it for its container and then work with that. I don't know how to javascript this better.
*/
function Brick(args) {
	
	var length = args.length
	var isUnified = args.isUnified ? args.isUnified : false
	var isEmpty = args.isEmpty ? args.isEmpty : false
	
	var color = args.color
	var borderColor = args.borderColor ? args.borderColor : color
	var borderWidth = args.borderWidth ? args.borderWidth : 0
	
	var size = args.size ? args.size : 50
	var isVertical = args.isVertical ? args.isVertical : false
	var cornerRadius = args.cornerRadius ? args.cornerRadius : 8

	// It doesn't really make sense to make a brick of 0 blocks, does it?
	if (length < 1) { return }
	
	
	// lol what is scope
	var self = this
	
	
	var container = new Layer({name: "brick"})
	if (isUnified) {
		container.backgroundColor = isEmpty ? Color.clear : color
		container.cornerRadius = cornerRadius
		container.border = new Border({width: borderWidth, color: borderColor})
	}
	var blocks = args.blocks || []
	
	
	// "public" properties
	// these have to be here because javascript can't do things out of order
	this.container = container
	this.blocks = blocks
	
	
	if (blocks.length < 1) {
		for (var index = 0; index < length; index++) {
			var color = color
			var block = makeBlock({color: color, size: size, cornerRadius: cornerRadius})
			

			blocks.push(block)
		}
	}
	
	/** Gets the number of blocks in this brick. Use this over the local variable length because it might get outdated. */
	this.length = function() { return blocks.length }
	
	var blockMargin = isUnified ? 0 : 2
	this.resizeBrickToFitBlocks = function() {
		var origin = container.origin
		
		var longSide = size * self.length() + (self.length() - 1) * blockMargin
		var shortSide = size
		
		var width = isVertical ? shortSide : longSide
		var height = isVertical ? longSide : shortSide
		
	
		container.size = new Size({width: width, height: height})
		container.origin = origin
	}
	
	this.layoutBlocks = function(args) {
		var animated = args ? args.animated : false
		
		var max = 0
		for (var index = 0; index < self.length(); index++) {

			var block = blocks[index]
			
			block.parent = container
			
			var x = isVertical ? 0: max + blockMargin
			var y = isVertical ? max + blockMargin : 0
			
			
			var origin = new Point({x: x, y: y})
			if (animated) {
				block.animators.origin.target = origin
			} else {
				// disable the position animator, which might be going if you quickly move the splitter and drop it before animation settles down.
				block.animators.position.stop()
				block.origin = origin
			}
			
			
			if (isUnified) {
				var line = block.lineLayer
				line.width = isVertical ? block.width : borderWidth
				line.height = isVertical ? borderWidth : block.height

				line.originY = 0
				if (isVertical) {
					line.originX = 0
				} else {
					line.moveToRightSideOfParentLayer()
				}
			}

			max += block.width + blockMargin
		}
		
	}
	
	this.resizeBrickToFitBlocks()
	this.layoutBlocks()
	

	// Privately, make a block
	function makeBlock(args) {
		var color = args.color
		var size = args.size
		var cornerRadius = isUnified ? 0 : args.cornerRadius
		
		var rect = new Rect({x: 50, y: 50, width: size, height: size})
		var block = new Layer({name: "block"})
		block.frame = rect
		
		if (isUnified) {
			// each block has a line layer, positioned in layoutBlocks
			var lineLayer = new Layer({parent: block})
			lineLayer.backgroundColor = borderColor
			block.lineLayer = lineLayer
		} else {
			block.border = new Border({color: borderColor, width: borderWidth})
		}
		block.cornerRadius = cornerRadius

		block.backgroundColor = isEmpty ? Color.clear : color


		return block
	}


	this.setDragDidBeginHandler = function(handler) { self.dragDidBeginHandler = handler }
	this.setDragDidMoveHandler = function(handler) { self.dragDidMoveHandler = handler }
	this.setDragDidEndHandler = function(handler) { self.dragDidEndHandler = handler }
	
	
	/** Split this brick at the index point. Creates a new brick and moves the blocks after the split into the new brick. Returns the new brick. */
	this.splitAtIndex = function(index) {
		
		// this logic is so hairy..
		var newArgs = args
		
		
		
		// split the blocks apart given the index. index is the block *before* the split.
		var lengthOfNewBrick = self.length() - (index + 1)
		newArgs.length = lengthOfNewBrick
		newArgs.blocks = blocks.splice(index + 1, lengthOfNewBrick)
		
		// we just split this block but we don't want it to still think it's split
		self.container.splitPoint = undefined
		
		var newBrick = new Brick(newArgs)
		
		self.resizeBrickToFitBlocks()
		// newBrick.container.frame = self.container.frame
		// newBrick.resizeBrickToFitBlocks()
		
		newBrick.container.moveToRightOfSiblingLayer({siblingLayer: self.container, margin: 15})
		newBrick.container.y = self.container.y
		// newBrick.container.origin = new Point({x: self.container.frameMaxX + 10, y: newBrick.container.originY})
		
		newBrick.setDragDidBeginHandler(self.dragDidBeginHandler)
		newBrick.setDragDidMoveHandler(self.dragDidMoveHandler)
		newBrick.setDragDidEndHandler(self.dragDidEndHandler)
		
		
		return newBrick
	}
	
	
	var nextBlockIndex = 0
	this.animateInNextBlock = function() {
		if (nextBlockIndex >= self.length()) { return }
		
		var block = self.blocks[nextBlockIndex]
	
		// TODO: let the blocks have a dashed border...I'll have to make them shapelayers, but then they lose touch handling?
		block.backgroundColor = color
		// block.fillColor = block.strokeColor
		// block.dashLength = undefined
		
		
		block.animators.scale.target = new Point({x: 1, y: 1})
		var velocity = 4
		block.animators.scale.velocity = new Point({x: velocity, y: velocity})
		
		nextBlockIndex++
		
		
		var index = nextBlockIndex - 1
		var allFlowersCompleted = index + 1 == length
		
		// numbersToSounds[index].play()
		
		// This should really happen in the "afterDuration" call below, but it seems I can use an animator in that?
		if (allFlowersCompleted) {
			container.animators.scale.target = new Point({x: 1, y: 1})
			container.animators.scale.velocity = new Point({x: velocity * 4, y: velocity * 4})
			
		}
		
		// TODO: add back sounds
		// afterDuration(0.5, function() {
		// 	flowerSounds[index + 1 == 1 ? 0 : 1].play()
		// 	if (allFlowersCompleted) {
		// 		// we've shown all the blocks, play success!
		// 		afterDuration(0.5, function() {
		// 			successSound.play()
		// 		})
		// 	}
		// })
	}


	container.becomeDraggable = function() {

		var initialPositionInContainer = new Point()
		container.touchBeganHandler = function(touchSequence) {
			initialPositionInContainer = touchSequence.currentSample.locationInLayer(container)
			container.comeToFront()
			if (self.dragDidBeginHandler) {
				self.dragDidBeginHandler()
			}
		}
	
		container.touchMovedHandler = function(touchSequence) {

			var position = touchSequence.currentSample.globalLocation
			container.origin = position.subtract(initialPositionInContainer)

			if (self.dragDidMoveHandler) {
				self.dragDidMoveHandler()
			}
		}

		container.touchEndedHandler = function(touchSequence) {
			if (self.dragDidEndHandler) {
				self.dragDidEndHandler()
			}
		}
	}

	container.becomeDraggable()

}

//-----------------------------------------
// x position indicator
//-----------------------------------------

function makeXPositionIndicator() {
	const container = new Layer()
	container.width = Layer.root.width
	container.origin = Point.zero

	const line = new ShapeLayer.Line({
		from: new Point({x: 0, y: 30}),
		to: new Point({x: 200, y: 30}),
		parent: container
	})
	line.strokeColor = Color.white
	line.strokeWidth = 2

	const dot = new ShapeLayer.Circle({
		center: new Point({x: 200, y: 30}),
		radius: 6,
		parent: container
	})
	dot.strokeColor = undefined
	dot.fillColor = Color.white

	const label = new TextLayer({parent: container})
	label.fontName = "Futura"
	label.fontSize = 24
	label.textColor = Color.white
	label.x = dot.frameMaxX + 40
	label.y = 12
	label.text = "test"

	container.setX = function(newGlobalX, newScreenX) {
		let segments = line.segments
		segments[1] = new Segment(new Point({x: newScreenX, y: line.segments[1].point.y}))
		line.segments = segments

		dot.x = newScreenX

		label.text = (Math.floor((newGlobalX - charInitialX) / 25)).toString()
		label.x = dot.frameMaxX + 40
	}

	return container
}


//-----------------------------------------
// Helpers
//-----------------------------------------
function log(obj) {
	console.log(JSON.stringify(obj, null, 4))
}

// Shamelessly stolen from http://stackoverflow.com/a/10073788
function pad(n, width, z) {
  z = z || '0';
  n = n + '';
  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
}
