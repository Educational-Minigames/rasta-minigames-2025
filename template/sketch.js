const aspectRatio = 9 / 16;

let rastaLogo;
let kamvaLogo;
let myfont;

const bgNum = 1; //choose from {1,2,3,4}
let bgImage;

const gameFont = 'bkamran' //change if needed.

function preload() {
  // loading background and logos
  bgImage = loadImage(`../assets/backgrounds/0${1}.jpg`);
  kamvaLogo = loadImage(`../assets/logos/kamva.png`);
  rastaLogo = loadImage(`../assets/logos/rasta.png`);
}

function setup() {
  textFont('bkamran'); // default font for our minigames
  createCanvas(windowWidth, windowWidth * aspectRatio); // aspect ratio 4x3 works better in kamva
  showBackground();
  showLogos(width * 0.01, height * 0.8, height * 0.19);
  showDescription(width * 0.97, height * 0.76, 'قالب بازی‌ها', 'اسم شما دوست عزیز');
}

// showing background. change transparency if needed.
function showBackground() {
  let transparency = 200;
  background(255);
  tint(255, transparency);
  image(bgImage, 0, 0, width, height, 0, 0, bgImage.width, bgImage.height, COVER, CENTER);
  noTint();
}

// showing logos. x, y are coordinates of the top left of logos 
function showLogos(x, y, logoSize) {
  translate(x, y);
  image(rastaLogo, 0, 0, logoSize, logoSize);
  image(kamvaLogo, logoSize, 0, logoSize, logoSize);
  translate(-x, -y);
}

function showDescription(x, y, gameName, developerName) {
  textAlign(RIGHT, TOP);
  h = 0;
  translate(x, y);
  textStyle(BOLD);
  
  let nameSize = height * 0.07;
  textSize(nameSize);
  text(gameName, 0, h);
  h += nameSize;

  let schoolSize = height * 0.07;
  textSize(schoolSize);
  text('رویداد تاسبتانه ۱۴۰۴ رستا', 0, h);
  h += schoolSize * 1.1;

  let devSize = height * 0.04;
  textSize(devSize);
  text(`نام طراح: ${developerName}`, 0, h);
  translate(-x, -y);
  textStyle(NORMAL);
}

function windowResized() {
  resizeCanvas(windowWidth, windowWidth * aspectRatio);
  setup();
}
