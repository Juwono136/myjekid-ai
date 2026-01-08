// server/src/utils/emailTemplates.js

export const getHandoffEmailTemplate = (data) => {
  const { userName, userPhone, message, dashboardUrl } = data;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background-color: #f14c06; color: #fff; padding: 20px; text-align: center; }
        .content { padding: 30px; }
        .alert-box { background-color: #fff4e5; border-left: 5px solid #f14c06; padding: 15px; margin: 20px 0; font-style: italic; color: #555; }
        .btn { display: inline-block; background-color: #f14c06; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 20px; }
        .footer { background-color: #333; color: #888; text-align: center; padding: 15px; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin:0;">🚨 Butuh Bantuan Admin</h2>
        </div>
        <div class="content">
          <p>Halo Admin,</p>
          <p>Sistem mendeteksi permintaan intervensi manual (Human Handoff) dari pengguna:</p>
          
          <table style="width: 100%; margin-top: 10px; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px 0; font-weight: bold; width: 100px;">Nama User:</td>
              <td>${userName}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-weight: bold;">No. Telepon:</td>
              <td>${userPhone}</td>
            </tr>
          </table>

          <div class="alert-box">
            "${message}"
          </div>

          <p>Bot telah dimatikan sementara untuk user ini. Silakan ambil alih percakapan melalui dashboard.</p>
          
          <div style="text-align: center;">
            <a href="${dashboardUrl}" class="btn">Buka Intervention Mode</a>
          </div>
        </div>
        <div class="footer">
          &copy; ${new Date().getFullYear()} MyJek Admin System. All rights reserved.
        </div>
      </div>
    </body>
    </html>
  `;
};
