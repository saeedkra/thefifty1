// Array to store street sections
let sections = [];

// Get elements from the HTML
const street = document.getElementById("street");
const sidewalkBtn = document.getElementById("sidewalk");
const bikeBtn = document.getElementById("bike-lane");
const carBtn = document.getElementById("car-lane");

// Function to draw the street
function drawStreet() {
  street.innerHTML = ""; // Clear the street
  sections.forEach((section, index) => {
    const div = document.createElement("div");
    div.style.width = section.width + "px";
    div.style.backgroundColor = section.color;
    div.innerText = section.type;
    // Click to move left
    div.onclick = function() {
      if (index > 0) {
        [sections[index], sections[index - 1]] = [sections[index - 1], sections[index]];
        drawStreet();
      }
    };
    street.appendChild(div);
  });
}

// Function to add a section
function addSection(type, color, width) {
  // Check if total width stays under 800px
  const totalWidth = sections.reduce((sum, s) => sum + s.width, 0) + width;
  if (totalWidth <= 800) {
    sections.push({ type, color, width });
    drawStreet();
  } else {
    alert("No more space! Total width can't exceed 800px.");
  }
}

// Button click events
sidewalkBtn.onclick = function() {
  addSection("Sidewalk", "#cccccc", 100);
};
bikeBtn.onclick = function() {
  addSection("Bike Lane", "#00cc00", 50);
};
carBtn.onclick = function() {
  addSection("Car Lane", "#666666", 150);
};