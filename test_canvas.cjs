const { createCanvas } = require('canvas');
const canvas = createCanvas(200, 200);
const ctx = canvas.getContext('2d');
ctx.fillText("hello\nworld", 10, 10);
console.log(ctx.measureText("hello\nworld").width);
