const txt = "closed-door meeting with Marcus your department manager";
const lines = [];
let maxW = 500; // random
// We know from the screenshot it IS wrapping. It wraps into 3 lines:
// "closed-door meeting with"
// "Marcus your department"
// "manager"
// Why did it wrap and position itself like that if it's an intro?
// The screenshot shows the second chip is selected ("Y", 3s, red dot). Wait, the red dot is on the first chip "I", but it's partially obscured. 
// No, the red dot is clearly above the "I" chip. "I" stands for Intro!
// Yes, it is the Intro chip!
// Ah, the first chip is selected.
