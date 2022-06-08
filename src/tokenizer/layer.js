import Utils from '../utils.js';
import { geom } from '../marching-squares.js';
import CONSTANTS from '../constants.js';

export default class Layer {
  constructor(view, canvas, img = null, color = null) {
    this.view = view;
    this.id = Utils.generateUUID();
    this.canvas = canvas;

    // the current position of the source image on the view canvas
    this.position = {
      x: 0,
      y: 0,
    };

    // the current scale, will be calculated once an image is loaded into the view canvas
    this.scale = 1;

    // the current degree of rotation
    this.rotation = 0;

    // mirror
    this.center = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
    this.mirror = 1;
    this.flipped = false;

    // canvas referencing to the source (image) that will be displayed on the view canvas
    this.source = Utils.cloneCanvas(this.canvas);
    // the image drawn on the source, kept for rotations
    if (img) {
      this.img = img;
      this.sourceImg = img.src;
    }

    // active layers allow mouse events to be followed (scale/translate)
    this.active = false;

    // controls the rendering of the layer: masked and by using which mask exactly?
    // source mask is the mask generated by the source image, and mask can be another mask
    // from another layer

    // indicates that this layer's mask is the one that is applied to all other layers
    this.providesMask = false;

    this.masked = false;
    this.sourceMask = null;
    this.mask = null;

    this.alpha = 1.0;
    this.compositeOperation = CONSTANTS.BLEND_MODES.DEFAULT;
    this.visible = true;

    // initialize with color
    this.previousColor = null;
    this.color = color;
    this.colorLayer = color !== null;
  }

  static isTransparent(pixels, x, y) {
    return CONSTANTS.TRANSPARENCY_THRESHOLD < pixels.data[(((y * pixels.width) + x) * 4) + 3];
  }

  /**
   * Activates the event listeners on the view canvas for scaling and translating
   */
  activate() {
    this.active = true;
  }

  /**
   * Deactivates the event listeners on the view canvas for scaling and translating (color picking is always active)
   */
  deactivate() {
    this.active = false;
  }

  isCompletelyTransparent() {
    const pixels = this.source.getContext('2d').getImageData(0, 0, this.source.width, this.source.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] > CONSTANTS.TRANSPARENCY_THRESHOLD) {
        return false;
      }
    }

    return true;
  }

  isCompletelyOpaque() {
    const pixels = this.source.getContext('2d').getImageData(0, 0, this.source.width, this.source.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < CONSTANTS.TRANSPARENCY_THRESHOLD) {
        return false;
      }
    }
    return true;
  }

  /**
   * Creates a mask using the marching squares algorithm by walking the edges of the non-transparent pixels to find a contour.
   * Works naturally best for token images which have a circular ring-shape. The algorithm walks the contour and fills the inner regions with black, too
   * The mask is not active on creating, it is controlled by
   *
   * this.applyMask(mask | null), see above
   */
  createMask() {
    // create intermediate canvas
    const temp = document.createElement('canvas');
    // create a canvas that has at least a 1px transparent border all around
    // so the marching squares algorithm won't run endlessly
    temp.width = CONSTANTS.MASK_DENSITY + 2;
    temp.height = CONSTANTS.MASK_DENSITY + 2;
    temp.getContext('2d').drawImage(this.canvas, 1, 1, this.canvas.width, this.canvas.height, 1, 1, CONSTANTS.MASK_DENSITY, CONSTANTS.MASK_DENSITY);

    // get the pixel data from the source image
    let context = temp.getContext('2d');
    const pixels = context.getImageData(0, 0, CONSTANTS.MASK_DENSITY + 2, CONSTANTS.MASK_DENSITY + 2);

    // re-use the intermediate canvas
    const defaultFillColor = game.settings.get(CONSTANTS.MODULE_ID, "default-color");
    if (defaultFillColor !== "") context.fillStyle = defaultFillColor;
    context.strokeStyle = '#000000AA';
    context.lineWidth = 1;

    // the mask is totally transparent
    if (this.isCompletelyTransparent()) {
      context.clearRect(0, 0, temp.width, temp.height);
    } else if (this.isCompletelyOpaque()) {
      context.clearRect(0, 0, temp.width, temp.height);
      context.fillRect(0, 0, temp.width, temp.height);
      context.fill();
    } else {
      // process the pixel data
      const points = geom.contour((x, y) => Layer.isTransparent(pixels, x, y));
      context.clearRect(0, 0, temp.width, temp.height);
      context.beginPath();
      context.moveTo(points[0][0], points[0][4]);
      for (let i = 1; i < points.length; i++) {
        const point = points[i];
        context.lineTo(point[0], point[1]);
      }
      context.closePath();
      context.fill();
    }


    // clip the canvas
    this.sourceMask = document.createElement('canvas');
    this.sourceMask.width = this.source.width;
    this.sourceMask.height = this.source.height;
    this.sourceMask
      .getContext('2d')
      .drawImage(temp, 1, 1, CONSTANTS.MASK_DENSITY, CONSTANTS.MASK_DENSITY, 0, 0, this.source.width, this.source.height);
  }

  /**
   * Sets the mask for this image to an existing, foreign mask or to the sourceMask, which is already generated
   * @param {canvas} mask Canvas or null. If set to null, the sourceMask is used for masking, otherwise a given mask
   */
  applyMask(mask = null) {
    if (mask === null) {
      this.mask = this.sourceMask;
    } else {
      this.mask = mask;
    }
    this.masked = true;
  }

  /**
   * Removes the application of the current set mask, but does not delete said mask from the object
   */
  removeMask() {
    this.masked = false;
  }

  static fromImage(view, img, canvasHeight, canvaseWidth) {
    const height = Math.max(1000, canvasHeight, img.naturalHeight, img.naturalWidth);
    const width = Math.max(1000, canvaseWidth, img.naturalHeight, img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    
    const scaledWidth = img.naturalHeight > img.naturalWidth
      ? height * (img.width / img.height)
      : width;
 
    const scaledHeight = img.naturalWidth > img.naturalHeight
      ? width * (img.height / img.width)
      : height;

    const yOffset = (width - scaledWidth) / 2;
    const xOffset = (height - scaledHeight) / 2;

    const context = canvas.getContext("2d");
    context.drawImage(
        img,
        0,
        0,
        img.naturalWidth,
        img.naturalHeight,
        yOffset,
        xOffset,
        scaledWidth,
        scaledHeight
      );

    const layer = new Layer(view, canvas, img);
    layer.createMask();
    layer.redraw();
    return layer;
  }

  static fromColor(view, color, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    context.fillStyle = color;
    context.rect(0, 0, canvas.width, canvas.height);
    context.fill();

    const layer = new Layer(view, canvas, null, color);
    layer.redraw();
    return layer;
  }


  /**
   * Sets the background color for this layer. It will be masked, too
   * @param {color} hexColorString
   */
  setColor(hexColorString = null) {
    this.color = hexColorString;
    const context = this.canvas.getContext("2d");
    context.fillStyle = hexColorString;
    context.rect(0, 0, this.width, this.height);
    context.fill();
    this.source = Utils.cloneCanvas(this.canvas);

    this.redraw();
  }

  saveColor() {
    this.previousColor = this.color;
  }

  restoreColor() {
    this.color = this.previousColor;
    this.redraw();
  }

  reset() {
    this.scale = this.width / Math.max(this.source.width, this.source.height);
    this.rotation = 0;
    this.position.x = Math.floor((this.width / 2) - ((this.source.width * this.scale) / 2));
    this.position.y = Math.floor((this.height / 2) - ((this.source.height * this.scale) / 2));
    this.redraw();
  }

  /**
   * Gets the width of the view canvas
   */
  get width() {
    return this.canvas.width;
  }

  /**
   * Gets the height of the view canvas
   */
  get height() {
    return this.canvas.height;
  }

  /**
   * Translates the source on the view canvas
   * @param {Number} dx translation on the x-axis
   * @param {Number} dy translation on the y-axis
   */
  translate(dx, dy) {
    this.position.x -= dx;
    this.position.y -= dy;
    // this.redraw();
  }

  /**
   * Scales the source on the view canvas according to a given factor
   * @param {Number} factor
   */
  setScale(factor) {
    this.scale = factor;
  }

  rotate(degree) {
    this.rotation += degree * 2;
  }

  flip() {
    this.mirror *= -1;
    this.flipped = !this.flipped;
    this.redraw();
  }

  /**
   * Refreshes the view canvas with the background color and/or the source image
   */
  redraw() {
    // we take the original image and apply our scaling transformations
    const original = Utils.cloneCanvas(this.source);

    const computedLayer = original.getContext("2d");
    computedLayer.resetTransform();
    computedLayer.clearRect(0, 0, this.source.width, this.source.height);
    computedLayer.translate(this.center.x, this.center.y);
    computedLayer.scale(this.mirror * 1, 1);
    computedLayer.rotate(this.rotation * CONSTANTS.TO_RADIANS);
    computedLayer.translate(-this.center.x, -this.center.y);
    computedLayer.drawImage(this.source, 0, 0);
    computedLayer.resetTransform();

    // place the computed layer on the view canvas

    const context = this.canvas.getContext("2d");
    context.globalCompositeOperation = CONSTANTS.BLEND_MODES.SOURCE_OVER;
    context.clearRect(0, 0, this.source.width, this.source.height);
    context.resetTransform();

    // we apply the mask if the layer is below the masking layer
    if (this.view.isOriginLayerHigher(this.view.maskId, this.id)) {
      const maskLayer = this.view.getMaskLayer(this.view.maskId);
      context.drawImage(
        maskLayer.sourceMask,
        0,
        0,
        maskLayer.width,
        maskLayer.height,
        0,
        0,
        this.canvas.width,
        this.canvas.height
      );
      // context.resetTransform();
      context.globalCompositeOperation = CONSTANTS.BLEND_MODES.SOURCE_IN;
    }
    context.translate(0, 0);

    // apply computed image and scale
    context.drawImage(
      original,
      this.position.x,
      this.position.y,
      this.source.width * this.scale,
      this.source.height * this.scale
    );
    context.resetTransform();

  }
}
