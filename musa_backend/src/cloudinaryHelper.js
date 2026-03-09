const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const isCloudinaryConfigured = () => {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
};

/**
 * Upload a buffer (from multer) to Cloudinary
 * @param {Buffer} buffer - file buffer
 * @param {string} folder - Cloudinary folder (e.g. "productos", "usuarios", "tv")
 * @returns {Promise<string>} Cloudinary secure URL
 */
const uploadBuffer = (buffer, folder = "musa") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image", quality: "auto", fetch_format: "auto" },
      (err, result) => {
        if (err) return reject(err);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};

/**
 * Upload a base64 data URI to Cloudinary
 * @param {string} dataUri - e.g. "data:image/jpeg;base64,..."
 * @param {string} folder
 * @returns {Promise<string>} Cloudinary secure URL
 */
const uploadBase64 = async (dataUri, folder = "musa") => {
  const result = await cloudinary.uploader.upload(dataUri, {
    folder,
    resource_type: "image",
    quality: "auto",
    fetch_format: "auto",
  });
  return result.secure_url;
};

/**
 * Delete an image from Cloudinary by URL
 */
const deleteByUrl = async (url) => {
  try {
    // Extract public_id from URL: https://res.cloudinary.com/cloud/image/upload/v123/folder/filename.ext
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
    if (match) {
      await cloudinary.uploader.destroy(match[1]);
    }
  } catch (err) {
    console.error("Cloudinary delete error:", err.message);
  }
};

/**
 * Check if a string is a Cloudinary URL (or any http URL)
 */
const isUrl = (str) => {
  return str && (str.startsWith("http://") || str.startsWith("https://"));
};

module.exports = { cloudinary, isCloudinaryConfigured, uploadBuffer, uploadBase64, deleteByUrl, isUrl };
