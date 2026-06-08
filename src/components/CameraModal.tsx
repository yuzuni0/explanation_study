"use client";
//カメラのモーダルをこちらに実装する
import React, { useState } from "react";
import { BsCircle } from "react-icons/bs";
import { FiX } from "react-icons/fi";
import { IoCameraOutline } from "react-icons/io5";
import { GoFileMedia } from "react-icons/go";
import { InlineMath, BlockMath } from "react-katex";
import ReactCrop, { type Crop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import Modal from 'react-modal';
import Webcam from "react-webcam";


type Props = {
  crop?: Crop | undefined;
  onCompose: (file: File) => void;
  ocrText: string;
  problemType: string | null;
}

export default function CameraModal({ onCompose, ocrText, problemType }: Props) {
  const webcamRef = React.useRef<Webcam>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const capture = () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    setimageSrc(imageSrc);
  }



  //モーダル用のState
  const [ModalMode, setModalMode] = useState<"select" | "camera" | "confilm" | "result" | null>("select");
  const [imageSrc, setimageSrc] = useState<string | null | undefined>(null);
  const [crop, setCrop] = useState<Crop>({ unit: "%", x: 0, y: 0, width: 0, height: 0 });

  const imageRef = React.useRef<HTMLImageElement>(null);

  const fileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setimageSrc(ev.target?.result as string);
      setModalMode("confilm");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  //カメラ設定
  const videoConstraints = {
    facingMode: "environment",
    width: { ideal: 1920 },
    height: { ideal: 1080 },
  }


  //カメラモーダルのスタイル
  const selectStyle = {
    content: {
      justifyContent: "center",
      alignItems: "center",
      top: '30.5%',
      left: '25%',
      right: '25%',
      height: '39%',
      overflow: "hidden",
      display: "flex",
      borderRadius: "3%",

    }
  }
  const resultStyle = {
    content: {
      top: '18%',
      left: '25%',
      right: '25%',
      height: '60%',
      display: "flex",
      flexDirection: "column" as const,
      borderRadius: "3%",

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

  const selectCameraStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: "5%",
    width: "50%",
    marginRight: "0.5%",
    backgroundColor: "#e8f4fd",
  }

  const resultCameraStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    width: "50%",
    borderRadius: "5%",
    marginRight: "0.5%",
    backgroundColor: "#e8f4fd",
  }

  const selectfileStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: "5%",
    width: "50%",
    marginLeft: "0.5%",
    backgroundColor: "#e8f8e8",
  }
  const resultfileStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    height: "100%",
    width: "50%",
    borderRadius: "16px",
    marginLeft: "0.5%",
    backgroundColor: "#e8f8e8",
  }

  const fixStyle: React.CSSProperties = {
    position: "absolute",
  }

  const imageStyle: React.CSSProperties = {
    maxWidth: "100%",
    height: "auto",
    width: "auto",
  }

  const confilmCropStyle: React.CSSProperties = {
    maxHeight: "100%",
    maxWidth: "100%",
    justifyContent: "center",
    alignItems: "center",
    objectFit: "contain",
    overflow: "hidden"
  }

  const no$ocrTextstyle: React.CSSProperties = {
    justifyContent: "center",
    display: "inline",
  
    alignItems: "baseline",
    objectFit: "contain",
    overflowY: "auto",
    fontSize: "clamp(16px, 2vw, 24px)",
    overflow: "hidden",

    height: "100%",
    marginTop: "2%",
  }

  const resultocrStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    flex: 1,
    alignItems: "stretch",
    borderRadius: "16px",
    overflowY: "auto",
    marginTop: "0.5%",
    justifyContent: "center",
    height: "100%",
    backgroundColor: "#fffacd",
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

  const cutCrop = () => {//切り取った画像の再描画
    const image = imageRef.current;
    if (!image) return;
    //サイズの%をpxに変換
    const realPxelX = crop.x * (image.naturalWidth / image.offsetWidth)
    const realPxelY = crop.y * (image.naturalHeight / image.offsetHeight);
    const realPxelWidth = crop.width * (image.naturalWidth / image.offsetWidth)
    const realPxelHeight = crop.height * (image.naturalHeight / image.offsetHeight)
    //切り取った画像をcanvasに描画
    const canvas = document.createElement("canvas");
    canvas.width = realPxelWidth;
    canvas.height = realPxelHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(
      image,
      realPxelX,
      realPxelY,
      realPxelWidth,
      realPxelHeight,
      0,
      0,
      realPxelWidth,
      realPxelHeight,
    );
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], "cropped_image.png", { type: "image/png" });
      onCompose(file);
    });
  }

  const division$ocrText = ocrText.split("$");

  const ocrTextElements = division$ocrText.map((part, i) => {
    if (i % 2 === 0) {
      return <span key={i}>{part}</span>
    } else {
      return <InlineMath key={i} math={part} />
    }
  })

  const no$ocrText = ocrText.replaceAll("$", "");

  //page.tsxに返す
  return (
    <div>

      {/* モーダル */}
      <Modal
        isOpen={ModalMode === "select"}
        style={selectStyle}
      >
        <button onClick={() => setModalMode("camera")}
          style={selectCameraStyle}>
          <IoCameraOutline
            size={"80%"}
          />
          カメラで撮影する
        </button>
        {/*ファイルから取り出す*/}
        <button onClick={() => fileInputRef.current?.click()}
          style={selectfileStyle}>
          <GoFileMedia
            size={"80%"} />
          写真から選択する
        </button>

        <FiX onClick={() => setModalMode(null)}
          style={fixStyle}
          size={"2%"} />
      </Modal>
      <input
        type="file"
        accept="image/*"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={fileUpload}
      />

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
            <img src={imageSrc} ref={imageRef} alt="" style={imageStyle} />
          </ReactCrop>
        )}

        <button onClick={() => {
          cutCrop()
          setModalMode("result")
        }}>
          決定
        </button>
      </Modal>

      <Modal
        isOpen={ModalMode === "result"}
        style={resultStyle}>
        <div style={{ display: "flex", flexDirection: "row", width: "100%", flex: "0 0 60%" }}>
          <button onClick={() => setModalMode("camera")}
            style={resultCameraStyle}>
            <IoCameraOutline
              size={"80%"}
            />
            再撮影する
          </button>
          {/*ファイルから取り出す*/}
          <button onClick={() => fileInputRef.current?.click()}
            style={resultfileStyle}>
            <GoFileMedia
              size={"80%"} />
            写真から選択する
          </button>
          <input
            type="file"
            accept="image/*"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={fileUpload}
          />
        </div>
        <button onClick={() => setModalMode(null)}
          style={resultocrStyle}>
          <div style={{ ...no$ocrTextstyle, flex: 1, alignItems: "center" }}>
            {problemType === "math" && <BlockMath math={no$ocrText} />}
            {problemType === "sentence" && ocrTextElements}
          </div>
          <div
            style={{ padding: "2%" }}>
            この問題を解く
          </div>
        </button>
      </Modal>
    </div >
  )
}