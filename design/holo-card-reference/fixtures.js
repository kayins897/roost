/* Synthetic artwork for calibration; no game or video assets are embedded. */
window.HoloFixtures = {
  cover() {
    const c = document.createElement('canvas');
    c.width = 480; c.height = 720;
    const x = c.getContext('2d');
    x.fillStyle = '#abb4d1'; x.fillRect(0, 0, 480, 720);
    x.fillStyle = '#414d7b'; x.fillRect(20, 20, 440, 680);
    x.fillStyle = '#648ab4'; x.fillRect(34, 34, 412, 652);
    x.fillStyle = '#293548';
    x.beginPath(); x.moveTo(34, 480); x.lineTo(144, 204); x.lineTo(270, 500); x.lineTo(345, 346); x.lineTo(446, 570); x.lineTo(446, 686); x.lineTo(34, 686); x.closePath(); x.fill();
    x.fillStyle = '#dfab89'; x.beginPath(); x.arc(333, 172, 68, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#dce1e7'; x.beginPath(); x.moveTo(144, 204); x.lineTo(105, 302); x.lineTo(146, 275); x.lineTo(186, 300); x.closePath(); x.fill();
    x.strokeStyle = '#b8bac9'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(34, 547); x.bezierCurveTo(150, 500, 305, 650, 446, 558); x.stroke();
    x.fillStyle = '#f1e9dc'; x.font = 'bold 52px Georgia, serif'; x.textAlign = 'center';
    x.fillText('AFTERLIGHT', 240, 620);
    x.fillStyle = '#a5b0c4'; x.font = '15px sans-serif'; x.fillText('ROOST  /  MATERIAL STUDY', 240, 654);
    return c;
  },
  fromImage(image) {
    const c = document.createElement('canvas'); c.width = 480; c.height = 720;
    const x = c.getContext('2d'); x.fillStyle = '#18191e'; x.fillRect(0, 0, 480, 720);
    const k = Math.min(c.width / image.width, c.height / image.height);
    x.drawImage(image, (480 - image.width * k) / 2, (720 - image.height * k) / 2, image.width * k, image.height * k);
    return c;
  }
};
