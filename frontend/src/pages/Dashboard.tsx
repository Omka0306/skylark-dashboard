import { useEffect, useState } from 'react';
import { AppBar, Box, Button, Container, Dialog, DialogActions, DialogContent, DialogTitle, Grid2 as Grid, IconButton, Stack, TextField, Toolbar, Typography } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import AddIcon from '@mui/icons-material/Add';
import { createCamera, deleteCamera, listCameras, updateCamera, type Camera } from '../api';
import { useAuthStore } from '../auth';
import CameraTile from '../components/CameraTile';

export default function Dashboard() {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', rtspUrl: '', fps: 15 });
  const setToken = useAuthStore((s) => s.setToken);

  async function refresh() {
    const list = await listCameras();
    setCameras(list);
  }

  useEffect(() => { refresh(); }, []);

  async function save() {
    const cam = await createCamera({ ...form, enabled: true, fps: Number(form.fps) });
    setOpen(false);
    setForm({ name: '', location: '', rtspUrl: '', fps: 15 });
    setCameras((prev) => [cam, ...prev]);
  }

  async function remove(id: string) {
    await deleteCamera(id);
    setCameras((prev) => prev.filter((c) => c.id !== id));
  }

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Skylark Dashboard</Typography>
          <Button color="inherit" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Add Camera</Button>
          <IconButton color="inherit" onClick={() => setToken(null)}><LogoutIcon /></IconButton>
        </Toolbar>
      </AppBar>
      <Container sx={{ py: 2 }}>
        <Grid container spacing={2}>
          {cameras.map((cam) => (
            <Grid key={cam.id} size={{ xs: 12, md: 6, lg: 4 }}>
              <Stack spacing={1}>
                <CameraTile camera={cam} />
                <Stack direction="row" spacing={1}>
                  <Button variant="text" color="error" onClick={() => remove(cam.id)}>Delete</Button>
                  <TextField size="small" type="number" label="FPS" value={cam.fps} onChange={async (e) => {
                    const fps = Number(e.target.value);
                    const updated = await updateCamera(cam.id, { fps });
                    setCameras((prev) => prev.map((c) => c.id === cam.id ? updated : c));
                  }} />
                </Stack>
              </Stack>
            </Grid>
          ))}
        </Grid>
      </Container>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth>
        <DialogTitle>Add Camera</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} fullWidth />
            <TextField label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} fullWidth />
            <TextField label="RTSP URL" value={form.rtspUrl} onChange={(e) => setForm({ ...form, rtspUrl: e.target.value })} fullWidth />
            <TextField label="FPS" type="number" value={form.fps} onChange={(e) => setForm({ ...form, fps: Number(e.target.value) })} fullWidth />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
} 