import { useCallback, useEffect, useMemo, useRef } from 'react'

export type VoiceSignal = {
  type?: string
  from?: string
  targetId?: string
  signal?: any
  payload?: any
}

export type VoiceChatApi = {
  handleSignal: (msg: VoiceSignal) => void
  armAutoplay: () => void
}

type VoiceChatParams = {
  roomId?: string
  meId?: string
  players?: { id: string }[]
  sendSignal: (payload: unknown) => boolean
}

type PeerMap = Map<string, RTCPeerConnection>

function log(...args: any[]) {
  console.info('[voice]', ...args)
}

function warn(...args: any[]) {
  console.warn('[voice]', ...args)
}

export function useVoiceChat({ roomId, meId, players = [], sendSignal }: VoiceChatParams): VoiceChatApi {
  const pcsRef = useRef<PeerMap>(new Map())
  const remoteAudioRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)
  const autoplayArmedRef = useRef(false)

  const otherPlayerIds = useMemo(
    () => players.map((p) => p.id).filter((pid) => pid && pid !== meId),
    [players, meId],
  )

  const resumePlayback = useCallback(() => {
    remoteAudioRef.current.forEach((audio, peerId) => {
      if (!audio) return
      audio
        .play()
        .then(() => log(`autoplay resumed for peer ${peerId}`))
        .catch((err) => warn('failed to resume audio', peerId, err))
    })
  }, [])

  const armAutoplay = useCallback(() => {
    autoplayArmedRef.current = true
    resumePlayback()
  }, [resumePlayback])

  const ensureRemoteAudio = useCallback(
    (peerId: string): HTMLAudioElement => {
      let audio = remoteAudioRef.current.get(peerId)
      if (!audio) {
        audio = document.createElement('audio')
        audio.dataset.peerId = peerId
        audio.autoplay = true
        audio.controls = false
        audio.playsInline = true
        audio.style.display = 'none'
        document.body.appendChild(audio)
        remoteAudioRef.current.set(peerId, audio)
        log('created remote audio element for peer', peerId)
      }
      return audio
    },
    [],
  )

  const disposeAll = useCallback(() => {
    pcsRef.current.forEach((pc, peerId) => {
      try {
        pc.close()
        log('closed peer connection', peerId)
      } catch (err) {
        warn('failed to close pc', peerId, err)
      }
    })
    pcsRef.current.clear()
    remoteAudioRef.current.forEach((audio, peerId) => {
      try {
        audio.pause()
        audio.srcObject = null
        audio.remove()
        log('removed audio for peer', peerId)
      } catch (err) {
        warn('failed to remove audio element', peerId, err)
      }
    })
    remoteAudioRef.current.clear()
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }
  }, [])

  const sendRtcSignal = useCallback(
    (targetId: string, payload: any) => {
      if (!roomId || !meId) return
      const ok = sendSignal({ type: 'rtc_signal', targetId, player_id: meId, signal: payload })
      if (!ok) warn('failed to send rtc signal', payload)
    },
    [meId, roomId, sendSignal],
  )

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      localStreamRef.current = stream
      log('local audio captured')
      pcsRef.current.forEach((pc) => {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      })
      return stream
    } catch (err) {
      warn('failed to getUserMedia audio', err)
      throw err
    }
  }, [])

  const handleRemoteStream = useCallback(
    (peerId: string, stream: MediaStream) => {
      const audio = ensureRemoteAudio(peerId)
      const prev = audio.srcObject as MediaStream | null
      if (prev !== stream) {
        audio.srcObject = stream
        log('bound remote stream to audio', peerId)
      }
      if (autoplayArmedRef.current) {
        audio.play().catch((err) => warn('autoplay failed for peer', peerId, err))
      }
    },
    [ensureRemoteAudio],
  )

  const createPeer = useCallback(
    (peerId: string): RTCPeerConnection => {
      const existing = pcsRef.current.get(peerId)
      if (existing) return existing

      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })

      const makeOffer = async () => {
        try {
          log('negotiationneeded -> creating offer for', peerId)
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          sendRtcSignal(peerId, { sdp: pc.localDescription })
        } catch (err) {
          warn('failed to negotiate with peer', peerId, err)
        }
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          log('send ICE candidate to', peerId)
          sendRtcSignal(peerId, { candidate: ev.candidate })
        }
      }

      pc.onnegotiationneeded = makeOffer

      pc.oniceconnectionstatechange = () => {
        log('ice state', peerId, pc.iceConnectionState)
        if (['failed', 'disconnected', 'closed'].includes(pc.iceConnectionState)) {
          // try to restart later
          pcsRef.current.delete(peerId)
        }
      }

      pc.ontrack = (ev) => {
        const stream = ev.streams?.[0] || new MediaStream([ev.track])
        log('received remote track from', peerId, ev.track.kind)
        handleRemoteStream(peerId, stream)
      }

      pcsRef.current.set(peerId, pc)

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => pc.addTrack(track, localStreamRef.current!))
      } else {
        ensureLocalStream().catch(() => {})
      }

      if (pc.signalingState === 'stable' && !pc.localDescription) {
        makeOffer().catch(() => {})
      }

      return pc
    },
    [ensureLocalStream, handleRemoteStream, sendRtcSignal],
  )

  const handleSignal = useCallback(
    async (msg: VoiceSignal) => {
      const from = msg.from || msg.player_id
      const signal = msg.signal || msg.payload
      if (!from || !signal || from === meId) return
      const pc = createPeer(from)
      if (signal.sdp) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
          log('set remote description from', from, signal.sdp.type)
          if (signal.sdp.type === 'offer') {
            const stream = await ensureLocalStream()
            stream.getTracks().forEach((track) => pc.addTrack(track, stream))
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            sendRtcSignal(from, { sdp: pc.localDescription })
          }
        } catch (err) {
          warn('failed to handle SDP from', from, err)
        }
      } else if (signal.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate))
          log('added ICE candidate from', from)
        } catch (err) {
          warn('failed to add ICE candidate from', from, err)
        }
      }
    },
    [createPeer, ensureLocalStream, meId, sendRtcSignal],
  )

  useEffect(() => {
    if (!roomId || !meId) {
      disposeAll()
      return
    }
    ensureLocalStream().catch(() => {})
    return () => {
      disposeAll()
    }
  }, [disposeAll, ensureLocalStream, meId, roomId])

  useEffect(() => {
    // clean up peers that left
    pcsRef.current.forEach((_, peerId) => {
      if (!otherPlayerIds.includes(peerId)) {
        const pc = pcsRef.current.get(peerId)
        pc?.close()
        pcsRef.current.delete(peerId)
        const audio = remoteAudioRef.current.get(peerId)
        if (audio) {
          audio.pause()
          audio.srcObject = null
        }
        remoteAudioRef.current.delete(peerId)
        log('removed peer after roster update', peerId)
      }
    })

    // ensure connections to current peers
    otherPlayerIds.forEach((peerId) => {
      const pc = createPeer(peerId)
    })
  }, [createPeer, otherPlayerIds])

  useEffect(() => {
    if (!roomId) return
    const armOnce = () => {
      armAutoplay()
      document.removeEventListener('click', armOnce)
      document.removeEventListener('pointerdown', armOnce)
      document.removeEventListener('touchstart', armOnce)
      document.removeEventListener('keydown', armOnce)
    }
    document.addEventListener('click', armOnce)
    document.addEventListener('pointerdown', armOnce)
    document.addEventListener('touchstart', armOnce)
    document.addEventListener('keydown', armOnce)
    return () => {
      document.removeEventListener('click', armOnce)
      document.removeEventListener('pointerdown', armOnce)
      document.removeEventListener('touchstart', armOnce)
      document.removeEventListener('keydown', armOnce)
    }
  }, [armAutoplay, roomId])

  return { handleSignal, armAutoplay }
}
