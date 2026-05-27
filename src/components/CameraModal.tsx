"use client";
//カメラのモーダルをこちらに実装する
import React, { useState } from "react";
import { BsCircle } from "react-icons/bs";
import { FiX } from "react-icons/fi";
import ReactCrop, { type Crop } from 'react-image-crop'
import Modal from 'react-modal';
import Webcam from "react-webcam";


type Props = {
  onCompose: (file: File) => void;
}

export default function CameraModal({ onCompose }: Props) {

  const webcamRef = React.useRef<Webcam>(null);
  const capture = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    setimageSrc(imageSrc);
  }

  //モーダル用のState
  const [ModalMode, setModalMode] = useState<"select" | "camera" | "confilm">("select");
  const [imageSrc, setimageSrc] = useState<string | null | undefined>(null);
  const [crop, setCrop] = useState<Crop>({ unit: "%", x: 0, y: 0, width: 100, height: 100 });


  //カメラ設定
  const videoConstraints = {
    facingMode: "environment",
    width: { ideal: 1920 },
    height: { ideal: 1200 },
  }


  //カメラモーダルのスタイル
  const selectStyle = {
    content: {
      top: '48%',
      left: '25%',
      right: '25%',
    }
  }
  const cameraStyle = {
    content: {
      padding: 0,
      overflow: "hidden",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "black",
      border: "none",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
    }
  }
  const webcamStyle: React.CSSProperties = {
    height: '100%',
    width: '88%',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 0,
    inset: 0,
    objectFit: "contain"
  }

  const shutterButtonStyle: React.CSSProperties = {
    position: "absolute",
    color: "white",
    backgroundColor: "black",
    border: "none",
    top: "50%",
    left: "94%",
    width: "5%",
    height: "5%",
    transition: "transform 0.1s",
  }

  const confilmStyle = {
    content: {
      transform: "translateY(-14%)",
      top: '25%',
      left: '17%',
      right: '17%',
      bottom: '0%',
      display: "flex",
      justifyContent: "center",
      alignItems: "center"
    }
  }

  const cameraMouseDown = (e: React.MouseEvent<SVGElement>) => {
    //ボタンを押す時に縮ませる
    const button = e.currentTarget;
    button.style.transform = "scale(0.9)";

    //離したときに元に戻す
    const onMouseUp = () => {
      button.style.transform = "scale(1)"
    };
    window.addEventListener("mouseup", onMouseUp);
  }

  const imageStyle: React.CSSProperties = {
    maxHeight: "100%",
    maxWidth: "100%",
    objectFit: "contain"
  }

  const confilmCropStyle: React.CSSProperties = {
    maxHeight:"100%",
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",

  }


  //page.tsxに返す
  return (
    <div>

      {/* モーダル */}
      <Modal
        isOpen={ModalMode === "select"}
        style={selectStyle}
      >
        <button onClick={() => setModalMode("camera")}>
          <FiX />
        </button>
      </Modal>

      {/* カメラモーダル */}
      <Modal
        isOpen={ModalMode === "camera"}
        style={cameraStyle}
      >
        <Webcam
          audio={false}
          style={webcamStyle}
          disablePictureInPicture={true}
          screenshotFormat={"image/webp"}
          videoConstraints={videoConstraints}
          ref={webcamRef}
        />

        <BsCircle
          style={shutterButtonStyle}
          onMouseDown={cameraMouseDown}
          onClick={() => {
            capture()
            setModalMode("confilm")
          }}

        />
      </Modal>

      <Modal
        isOpen={ModalMode === "confilm"}
        style={confilmStyle}
      >
        {imageSrc && (
          <ReactCrop crop={crop} onChange={setCrop} style={confilmCropStyle}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc} alt="" style={imageStyle} />
          </ReactCrop>
        )}
      </Modal>
    </div>
  )
}