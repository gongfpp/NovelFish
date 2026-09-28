#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成 smoke 用的 EPUB 测试样本。

产物（提交进仓库，几 KB，供 tools/smoke.js 直接上传）：
  fixtures/sample.epub      EPUB3：nav 目录 + spine 里混着目录页与封面残页 +
                            一章拆成两节（ch2 有两个 h2）+ 一章没有标题（ch3）
  fixtures/sample-ncx.epub  EPUB2：只有 NCX 目录，正文标题全靠 NCX 提供

重跑：python3 tools/make-epub-fixtures.py
"""
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'fixtures')

# 每段都写足 40 字以上，免得被「封面 / 版权页」的短残页规则误伤
BODY = (
    '海风从东南来，带着咸腥的水汽，把岸边的芦苇压成一片伏倒的浪。'
    '船工们蹲在滩涂上补网，谁也不说话，只有梭子穿过麻线的声响。'
    '日头一点点斜下去，把整片海面烧成铜色，又慢慢冷成铁灰。'
)


def xhtml(title, body_html):
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<!DOCTYPE html>\n'
        '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">\n'
        '<head><title>%s</title></head>\n'
        '<body>\n%s\n</body>\n'
        '</html>\n'
    ) % (title, body_html)


def paras(n):
    return '\n'.join('<p>%s</p>' % BODY for _ in range(n))


def write(path, entries):
    """先写 mimetype（必须第一个且不压缩），再写其余文件"""
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        mi = zipfile.ZipInfo('mimetype')
        mi.compress_type = zipfile.ZIP_STORED
        z.writestr(mi, 'application/epub+zip')
        for name, data in entries:
            z.writestr(name, data, zipfile.ZIP_DEFLATED)
    print('wrote %s (%d bytes)' % (path, os.path.getsize(path)))


CONTAINER = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<container version="1.0" '
    'xmlns="urn:oasis:names:tc:opendocument:xmlns:container">\n'
    '  <rootfiles>\n'
    '    <rootfile full-path="OEBPS/content.opf" '
    'media-type="application/oebps-package+xml"/>\n'
    '  </rootfiles>\n'
    '</container>\n'
)


def build_sample():
    """EPUB3：nav 目录 + 覆盖 spine 里的目录页 / 短残页 / 拆节 / 无标题"""
    nav = xhtml('目录', (
        '<nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc" id="toc">\n'
        '  <h1>目录</h1>\n'
        '  <ol>\n'
        '    <li><a href="ch1.xhtml">第一章 落霞</a></li>\n'
        '    <li><a href="ch2.xhtml">第二章 潮信</a></li>\n'
        '    <li><a href="ch3.xhtml">第三章 夜航</a></li>\n'
        '    <li><a href="ch4.xhtml">第四章 归墟</a></li>\n'
        '  </ol>\n'
        '</nav>\n'
    ))

    # spine 里的目录页：链接多、行短 → 应该被 looksLikeToc 排掉
    toc_page = xhtml('目录', (
        '<h1>目录</h1>\n<ul>\n' +
        ''.join('<li><a href="ch%d.xhtml">%s</a></li>' % (i, t) for i, t in enumerate(
            ['第一章 落霞', '第二章 潮信', '第三章 夜航', '第四章 归墟'], 1)) +
        '\n</ul>\n'
    ))

    cover = xhtml('山海拾遗', '<h1>山海拾遗</h1><p>佚名 著</p>')

    ch1 = xhtml('第一章 落霞', '<h2>第一章 落霞</h2>\n' + paras(3))
    # 一章两个 h2：应切成两章
    ch2 = xhtml('第二章 潮信', '<h2>第二章 潮信</h2>\n' + paras(2) +
                             '<h2>潮信·补遗</h2>\n' + paras(2))
    # 完全没有标题：章节名只能来自 nav
    ch3 = xhtml('第三章 夜航', paras(3))
    # 正文标题与 nav 不同：正文标题优先
    ch4 = xhtml('第四章 归墟', '<h2>归墟（下）</h2>\n' + paras(3))

    opf = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">\n'
        '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
        '    <dc:identifier id="uid">urn:uuid:nf-sample-0001</dc:identifier>\n'
        '    <dc:title>山海拾遗</dc:title>\n'
        '    <dc:creator>佚名</dc:creator>\n'
        '    <dc:language>zh-CN</dc:language>\n'
        '  </metadata>\n'
        '  <manifest>\n'
        '    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>\n'
        '    <item id="toc" href="toc.xhtml" media-type="application/xhtml+xml"/>\n'
        '    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>\n'
        '    <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>\n'
        '    <item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>\n'
        '    <item id="c3" href="ch3.xhtml" media-type="application/xhtml+xml"/>\n'
        '    <item id="c4" href="ch4.xhtml" media-type="application/xhtml+xml"/>\n'
        '  </manifest>\n'
        '  <spine>\n'
        '    <itemref idref="cover"/>\n'
        '    <itemref idref="toc"/>\n'
        '    <itemref idref="c1"/>\n'
        '    <itemref idref="c2"/>\n'
        '    <itemref idref="c3"/>\n'
        '    <itemref idref="c4"/>\n'
        '  </spine>\n'
        '</package>\n'
    )

    write(os.path.join(OUT, 'sample.epub'), [
        ('META-INF/container.xml', CONTAINER),
        ('OEBPS/content.opf', opf),
        ('OEBPS/nav.xhtml', nav),
        ('OEBPS/toc.xhtml', toc_page),
        ('OEBPS/cover.xhtml', cover),
        ('OEBPS/ch1.xhtml', ch1),
        ('OEBPS/ch2.xhtml', ch2),
        ('OEBPS/ch3.xhtml', ch3),
        ('OEBPS/ch4.xhtml', ch4),
    ])


def build_ncx():
    """EPUB2：没有 nav，章节名全从 NCX 的 navMap 取"""
    ncx = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">\n'
        '  <docTitle><text>旧航日志</text></docTitle>\n'
        '  <navMap>\n'
        '    <navPoint id="n1" playOrder="1">\n'
        '      <navLabel><text>卷一 起锚</text></navLabel>\n'
        '      <content src="text/a.xhtml"/>\n'
        '    </navPoint>\n'
        '    <navPoint id="n2" playOrder="2">\n'
        '      <navLabel><text>卷二 锚地</text></navLabel>\n'
        '      <content src="text/b.xhtml"/>\n'
        '    </navPoint>\n'
        '  </navMap>\n'
        '</ncx>\n'
    )

    opf = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="uid">\n'
        '  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">\n'
        '    <dc:identifier id="uid">urn:uuid:nf-ncx-0002</dc:identifier>\n'
        '    <dc:title>旧航日志</dc:title>\n'
        '    <dc:language>zh-CN</dc:language>\n'
        '  </metadata>\n'
        '  <manifest>\n'
        '    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>\n'
        '    <item id="a" href="text/a.xhtml" media-type="application/xhtml+xml"/>\n'
        '    <item id="b" href="text/b.xhtml" media-type="application/xhtml+xml"/>\n'
        '  </manifest>\n'
        '  <spine toc="ncx">\n'
        '    <itemref idref="a"/>\n'
        '    <itemref idref="b"/>\n'
        '  </spine>\n'
        '</package>\n'
    )

    write(os.path.join(OUT, 'sample-ncx.epub'), [
        ('META-INF/container.xml', CONTAINER),
        ('OEBPS/content.opf', opf),
        ('OEBPS/toc.ncx', ncx),
        ('OEBPS/text/a.xhtml', xhtml('a', paras(3))),
        ('OEBPS/text/b.xhtml', xhtml('b', paras(3))),
    ])


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    build_sample()
    build_ncx()
