function showSection(sectionId) {
    let sections = document.querySelectorAll('.content');
    sections.forEach(section => {
        section.classList.add('hidden');
    });

    document.getElementById(sectionId).classList.remove('hidden');
}
function searchContent() {
  const input = document.getElementById("searchInput").value.toLowerCase();
  const sections = document.querySelectorAll(".content");

  // If search is empty, go back to normal view
  if (input.trim() === "") {
    sections.forEach(section => section.classList.add("hidden"));
    document.getElementById("start").classList.remove("hidden");
    return;
  }

  // If search has text, show sections that match
  sections.forEach(section => {
    const text = section.innerText.toLowerCase();
    if (text.includes(input)) {
      section.classList.remove("hidden");
    } else {
      section.classList.add("hidden");
    }
  });
}