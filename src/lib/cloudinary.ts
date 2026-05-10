const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export async function uploadToCloudinary(file: File): Promise<string> {
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
    throw new Error('Cloudinary env vars belum dikonfigurasi. Set VITE_CLOUDINARY_CLOUD_NAME dan VITE_CLOUDINARY_UPLOAD_PRESET.');
  }

  const resourceType = file.type.startsWith('video/') ? 'video' : 'image';
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const response = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    let errorMessage = 'Gagal mengunggah ke Cloudinary.';
    try {
      const errorData = await response.json();
      if (errorData?.error?.message) {
        errorMessage = `${errorMessage} ${errorData.error.message}`;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  if (!data?.secure_url && !data?.url) {
    throw new Error('Cloudinary tidak mengembalikan URL asset.');
  }

  return data.secure_url || data.url;
}
