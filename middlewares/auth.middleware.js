const jwt = require("jsonwebtoken");
require("dotenv").config();

module.exports = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Token missing" });
    }

    const token = authHeader.split(" ")[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        req.user = decoded; // contains userId + email
        req.userId = decoded.userId; // backward compatibility for routes using req.userId
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};
