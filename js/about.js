// Function to toggle the navbar when hamburger icon is clicked
let navBtn = document.getElementsByClassName("icon")[0];

navBtn.addEventListener('click', responsive_control);

function responsive_control() {
  let nav = document.getElementById("myTopnav");
  if (nav.className === "topnav") {
    nav.className += " responsive";
  } else {
    nav.className = "topnav";
  }
}