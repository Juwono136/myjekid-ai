import { ChatSession } from "../models/index.js";

// API untuk Admin mematikan/menyalakan Bot user tertentu (Switch mode)
export const setSessionMode = async (req, res) => {
  const { phone, mode, duration_minutes } = req.body;

  try {
    const session = await ChatSession.findOne({ where: { phone } });

    if (!session) {
      return res.status(404).json({ error: "Session user tidak ditemukan" });
    }

    let updateData = { mode };

    // Jika mode HUMAN/PAUSE, set timer otomatis
    if (mode === "HUMAN") {
      const pausedUntil = new Date();
      // Default pause 30 menit jika tidak ditentukan
      const duration = duration_minutes || 30;
      pausedUntil.setMinutes(pausedUntil.getMinutes() + duration);

      updateData.paused_until = pausedUntil;
    } else if (mode === "BOT") {
      updateData.paused_until = null; // Reset timer
    }

    await session.update(updateData);

    return res.json({
      message: `Sukses ubah mode ke ${mode} untuk user ${phone}`,
      data: updateData,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
