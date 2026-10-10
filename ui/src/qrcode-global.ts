// qrcode-generator (npm, versão fixa no package-lock) para o QR code do 2FA.
// js/components/verificacao.js (ainda em JavaScript) usa window.qrcode.
import qrcode from "qrcode-generator";

window.qrcode = qrcode;
