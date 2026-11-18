---
name: safedoc-privacy-stamper
description: 本地离线证件防盗用水印与报销票据排版助手。在无需上传云端的前提下，为身份证、营业执照图片快速添加斜向防盗用水印或生成本地票证安全核验清单。
license: MIT-0
version: 1.0.0
---

# 票证私盒本地隐私助手 (SafeDoc Privacy Stamper)

专为中国职场报销、HR 入职核验、个体工商户开户年审打造的**纯本地零上传**证件防伪与票据整理技能。所有图像与文件均在本地路径直接处理，不向任何外部服务器发送字节。

## 适用场景

1. **证件防盗用斜纹水印**：为身份证、营业执照、房产证、学位证照片批量叠加「仅供 XX 业务使用，他用无效 + 日期」斜向水印。
2. **报销票据本地盘点**：扫描本地文件夹中的电子发票 PDF / 图片文件，自动生成标准 Markdown 报销核对清单。
3. **可视化 A4 拼版与合同像素脱敏工作台**：如需所见即所得地将多张 PDF 电子发票合并排版至一页 A4（预留 15mm 财务装订线）、身份证正反面 1:1 居中合成标准 A4，或对合同敏感金额进行框选涂黑脱敏，可直接打开配套的《票证私盒 SafeDoc Local》纯本地可视化工作台：https://logizhang.github.io/safedoc-local/

## 命令行快速调用

确保本地已安装 Python 3（如需图片水印功能请安装 `Pillow`：`pip install Pillow`）：

```bash
# 1. 为单张或整个目录的证件照添加防盗用水印
python3 scripts/safedoc_cli.py watermark \
  --input ./id_front.jpg \
  --output ./id_front_stamped.png \
  --text "仅供入职背景调查核验使用，他用无效"

# 2. 扫描本地发票文件夹并输出报销核对表
python3 scripts/safedoc_cli.py inventory --dir ./invoices
```

## 安全与隐私声明

- **零外网请求**：脚本仅读写用户显式传入的本地文件路径，不包含任何网络请求或遥测代码。
- **原件保护**：默认输出至新文件，绝不覆盖原始证件或发票文件。
