# Virtual cable decision (gate test)

Status: **pending**. Gate test not run yet. Milestones 2 onward depend on a pass.

Driver candidate: VirtualDrivers/Virtual-Audio-Driver (MIT). Pinned release: _TBD_.

## Test setup

- Clean Windows 11 VM, Hyper-V Gen2, Secure Boot ON, test signing OFF.
- Snapshot taken before install: _TBD_.
- Windows build: _TBD_.

## Procedure

1. Install the pinned driver with the method from its release. Record the exact command and exit code.
2. Reboot if asked. Record whether a reboot was required.
3. Run in PowerShell:
   - `Get-PnpDevice -Class MEDIA` (expect Status `OK`, no error code 52)
   - `Get-PnpDevice -Class AudioEndpoint`
   - `Get-AuthenticodeSignature <driver files>` (expect valid)
4. Confirm the virtual speaker and virtual microphone appear in Windows sound settings.
5. Play audio to the virtual speaker and record it from the virtual microphone. Confirm it arrives (cable behavior).
6. Check formats: 48 kHz 16/24-bit stereo, plus 44.1 and 96 kHz. Record shared-mode behavior and latency.
7. Uninstall silently. Record the command and exit code. Confirm the device is removed.

## Results

| Item | Result |
| --- | --- |
| Install method and silent switches | _TBD_ |
| Install exit code | _TBD_ |
| Reboot required | _TBD_ |
| `Get-PnpDevice -Class MEDIA` status | _TBD_ |
| Error code 52 present | _TBD_ |
| Signature valid (`Get-AuthenticodeSignature`) | _TBD_ |
| Devices in Windows sound settings | _TBD_ |
| Cable loopback works | _TBD_ |
| Formats 48 kHz / 44.1 / 96 kHz | _TBD_ |
| Shared-mode latency | _TBD_ |
| Device names and hardware IDs | _TBD_ |
| Driver version | _TBD_ |
| Silent uninstall exit code | _TBD_ |
| MIT attribution requirements | _TBD_ |

## Decision

- Pass: ship the driver as released (sections 2–8 of the update plan).
- Fail: Plan B, fork the MIT driver as "moyboard cable" and sign via Hardware Dev Center attestation. Stop and re-plan.

Decision: _pending_
